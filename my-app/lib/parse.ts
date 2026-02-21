export function scoreResume(extractedText: string) {
  const text = extractedText.toLowerCase();
  const skills = [
    "javascript",
    "typescript",
    "react",
    "next.js",
    "node",
    "python",
    "sql",
    "aws",
    "gcp",
    "docker",
  ];
  const hits = skills.filter((s) => text.includes(s));

  const sections = ["experience", "education", "projects", "skills"];
  const sectionHits = sections.filter((s) => text.includes(s));

  const skillScore = Math.min(60, hits.length * 8);
  const sectionScore = Math.min(40, sectionHits.length * 10);
  const total = Math.min(100, skillScore + sectionScore);

  return {
    score: total,
    breakdown: {
      skills_found: hits,
      sections_found: sectionHits,
      skillScore,
      sectionScore,
    },
    version: "v1",
  };
}
