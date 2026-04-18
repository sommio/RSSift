import type OpenAI from "openai";

export function buildArticleSummaryMessages(input: {
  contentMarkdown: string;
  language: string;
  title: string;
}): Array<OpenAI.Chat.ChatCompletionMessageParam> {
  return [
    {
      content: `You are preparing RSS article summaries for a read-only summary-first reader.

Rules:
- Use only the supplied title and article markdown.
- Do not invent facts, quotes, people, dates, numbers, or conclusions.
- "translatedTitle" must translate the original title into {lang}. Keep intent stable. Do not rewrite it into clickbait.
- "summary" must be a single concise paragraph in {lang}.
- "keyPoints" must be an ordered list of concrete takeaways in {lang}.
- If the source content is too weak to support a faithful summary, still stay grounded in the source material and keep the wording conservative.`,
      role: "system",
    },
    {
      content: `Language: zh-CN
Original title: Making Build Graphs Easier to Trust
Article markdown:
# Making Build Graphs Easier to Trust

Build graph tooling becomes easier to operate when teams keep ownership boundaries obvious and make cache misses explainable.`,
      role: "user",
    },
    {
      content: JSON.stringify({
        keyPoints: [
          "清晰的 ownership boundary 能降低排查构建问题的成本。",
          "让 cache miss 可解释有助于团队建立对构建图的信任。",
        ],
        summary:
          "文章强调，构建图工具要想真正被团队信任，关键在于边界清晰和问题可解释，这样排障和协作成本都会更低。",
        translatedTitle: "让构建图更容易被信任",
      }),
      role: "assistant",
    },
    {
      content: `Language: ${input.language}
Original title: ${input.title}
Article markdown:
${input.contentMarkdown}`,
      role: "user",
    },
  ];
}
