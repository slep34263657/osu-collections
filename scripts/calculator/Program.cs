using System.Text.Json;
using osu.Framework.Logging;
using osu.Game.Beatmaps;
using osu.Game.Beatmaps.Formats;
using osu.Game.IO;
using osu.Game.Online.API;
using osu.Game.Rulesets;
using osu.Game.Rulesets.Catch;
using osu.Game.Rulesets.Mania;
using osu.Game.Rulesets.Mods;
using osu.Game.Rulesets.Osu;
using osu.Game.Rulesets.Taiko;
using osu.Game.Scoring;

Logger.Enabled = false;
LegacyDifficultyCalculatorBeatmapDecoder.Register();
var rulesets = new Ruleset[] { new OsuRuleset(), new TaikoRuleset(), new CatchRuleset(), new ManiaRuleset() };
string? line;
while ((line = Console.ReadLine()) != null)
{
    try
    {
        using var request = JsonDocument.Parse(line);
        var data = Convert.FromBase64String(request.RootElement.GetProperty("data").GetString()!);
        using var stream = new MemoryStream(data);
        using var reader = new LineBufferedReader(stream);
        var decoded = Decoder.GetDecoder<Beatmap>(reader).Decode(reader);
        var ruleset = rulesets[request.RootElement.GetProperty("mode").GetInt32()];
        decoded.BeatmapInfo.Ruleset = ruleset.RulesetInfo;
        var working = new FlatWorkingBeatmap(decoded);
        object calculate(Mod[] mods)
        {
            var attributes = ruleset.CreateDifficultyCalculator(working).Calculate(mods);
            var playable = working.GetPlayableBeatmap(ruleset.RulesetInfo, mods);
            using var processor = ruleset.CreateScoreProcessor();
            processor.ApplyBeatmap(playable);
            var maximum = processor.MaximumStatistics;
            var score = new ScoreInfo(playable.BeatmapInfo, ruleset.RulesetInfo)
            {
                Accuracy = 1,
                MaxCombo = attributes.MaxCombo,
                Statistics = maximum,
                MaximumStatistics = new(maximum),
                Mods = mods
            };
            var performance = ruleset.CreatePerformanceCalculator()?.Calculate(score, attributes);
            return new { stars = attributes.StarRating, pp = performance?.Total, maxCombo = attributes.MaxCombo };
        }
        var normal = calculate([]);
        var dt = calculate([new APIMod { Acronym = "DT" }.ToMod(ruleset)]);
        Console.WriteLine(JsonSerializer.Serialize(new { normal, dt }));
    }
    catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { error = error.ToString() })); }
}
