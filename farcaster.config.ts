const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const farcasterConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Daily Check-In",
    subtitle: "Daily mini app",
    description: "Minimal daily check-in mini app for Base.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0b0f1a",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "social",
    tags: ["daily", "check-in", "habit", "miniapp"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Log a quick daily check-in.",
    ogTitle: "Daily Check-In",
    ogDescription: "A minimal daily check-in mini app for Base.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;

