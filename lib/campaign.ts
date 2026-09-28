export interface CampaignDescriptionData {
  descriptionText: string;
  keywords: string[];
  aiScreening: boolean;
}

/**
 * Parses the campaign description string to extract the original description,
 * extracted keywords, and the AI screening toggle state.
 */
export function parseCampaignDescription(description: string | null): CampaignDescriptionData {
  if (!description) {
    return {
      descriptionText: "",
      keywords: [],
      aiScreening: false,
    };
  }

  const parts = description.split("---KEYWORDS---");
  const descriptionText = parts[0].trim();
  let keywords: string[] = [];
  let aiScreening = false;

  if (parts.length > 1) {
    const kwPart = parts[1].split("---AI_SCREENING---");
    try {
      keywords = JSON.parse(kwPart[0].trim());
    } catch (e) {
      console.error("Failed to parse keywords in description:", e);
    }
    if (kwPart.length > 1) {
      aiScreening = kwPart[1].trim() === "true";
    }
  } else if (description.includes("---AI_SCREENING---")) {
    const aiParts = description.split("---AI_SCREENING---");
    if (aiParts.length > 1) {
      aiScreening = aiParts[1].trim() === "true";
    }
  }

  return {
    descriptionText,
    keywords,
    aiScreening,
  };
}

/**
 * Encodes the campaign description text, job keywords, and AI screening toggle
 * into a single string to be stored in the database.
 */
export function encodeCampaignDescription(
  descriptionText: string,
  keywords: string[],
  aiScreening: boolean
): string {
  return `${descriptionText.trim()}\n\n---KEYWORDS---\n${JSON.stringify(keywords)}\n\n---AI_SCREENING---\n${aiScreening}`;
}
