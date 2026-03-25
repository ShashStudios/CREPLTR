import OpenAI from "openai";

export interface KimiAnalysis {
  headline: string;
  total_opportunity_score: number;
  market_summary: string;
  top_site_analysis: string;
  red_flags: string[];
  recommended_sites: number[];
  next_steps: string[];
  market_context: string;
}

export async function runKimiAnalysis(
  sites: any[],
  searchAreaAcres: number
): Promise<KimiAnalysis | null> {
  try {
    const client = new OpenAI({
      baseURL: (process.env.AZURE_ENDPOINT ?? "").replace(/\/?$/, "/openai/"),
      apiKey: process.env.AZURE_API_KEY,
      defaultQuery: { "api-version": "2024-05-01-preview" },
      defaultHeaders: {
        "api-key": process.env.AZURE_API_KEY,
        "Authorization": `Bearer ${process.env.AZURE_API_KEY}`,
      },
    });

    // Use env var, or discover first available chat model, or fall back to Kimi-k1.5
    const NON_CHAT_PREFIXES = ["dall-e", "tts", "whisper", "text-embedding", "text-similarity", "text-search", "code-search", "text-davinci", "text-babbage", "text-ada", "text-curie", "davinci", "babbage", "ada", "curie", "aoai-sora", "sora"];
    let modelName = process.env.AZURE_CHAT_MODEL ?? "Kimi-k1.5";
    if (!process.env.AZURE_CHAT_MODEL) {
      try {
        const models = await client.models.list();
        const chatModels = models.data
          .map((m: any) => m.id as string)
          .filter((id) => !NON_CHAT_PREFIXES.some((p) => id.toLowerCase().startsWith(p)));
        console.log("Available chat models:", chatModels.slice(0, 10));
        if (chatModels.length > 0) modelName = chatModels[0];
      } catch (e: any) {
        console.log("Could not list models:", e?.message);
      }
    }
    console.log("Using model:", modelName);

    const siteSummary = sites.slice(0, 20).map((s, i) => ({
      index: i,
      name: s.name ?? "Unnamed",
      acreage: s.acreage.toFixed(2),
      type: s.type,
      score: s.score,
      breakdown: s.breakdown,
    }));

    const userContent = `Search area: ${searchAreaAcres.toFixed(1)} acres\nSites found: ${sites.length}\n\nTop sites:\n${JSON.stringify(siteSummary, null, 2)}`;

    const [briefRes, contextRes] = await Promise.all([
      client.chat.completions.create({
        model: modelName,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a senior industrial real estate analyst specializing in Industrial Outdoor Storage (IOS) sites. You have been given a list of potential IOS sites found within a geographic search area, each with acreage, land use type, and a suitability score.

Analyze these results and respond ONLY with valid JSON (no markdown):
{
  "headline": "one sentence summarizing what was found",
  "total_opportunity_score": 7,
  "market_summary": "2-3 sentences about this area IOS potential",
  "top_site_analysis": "insight about the highest scored site",
  "red_flags": ["concern1", "concern2"],
  "recommended_sites": [0, 1, 2],
  "next_steps": ["action1", "action2", "action3"],
  "market_context": ""
}`,
          },
          { role: "user", content: userContent },
        ],
      }),
      client.chat.completions.create({
        model: modelName,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are an industrial real estate market strategist. Given this search area and the IOS sites found, provide 2-3 sentences on: current national IOS market demand trends, why this specific geography/submarket is or isn't attractive for IOS right now, and what types of tenants are most actively seeking IOS space. Be specific and data-informed. Plain text only.",
          },
          { role: "user", content: userContent },
        ],
      }),
    ]);

    const rawBrief = briefRes.choices[0].message.content ?? "{}";
    const cleanBrief = rawBrief.replace(/```json|```/g, "").trim();
    const brief: KimiAnalysis = JSON.parse(cleanBrief);
    brief.market_context = contextRes.choices[0].message.content ?? "";

    return brief;
  } catch (e: any) {
    console.error("Kimi analysis failed:", e);
    if (e?.stack) {
      console.error("Kimi error stack:", e.stack);
    }
    return null;
  }
}
