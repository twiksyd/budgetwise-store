export type TutorialStep = {
  image: string;
  imageWidth: number;
  imageHeight: number;
  alt: string;
  instruction: string;
  taglish?: string;
  note?: {
    title: string;
    body: string;
    image?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageAlt?: string;
  };
};

export type TutorialStage = {
  id: string;
  label: string;
  title: string;
  intro?: string;
  steps: TutorialStep[];
};

const IMG = "/tutorials/gamepass";

export const gamepassTutorialStages: TutorialStage[] = [
  {
    id: "create",
    label: "Create",
    title: "Create Your Experience",
    intro: "First, we'll make a blank Roblox experience to attach your gamepass to.",
    steps: [
      {
        image: `${IMG}/01-click-create.png`,
        imageWidth: 1134,
        imageHeight: 218,
        alt: "Roblox homepage navigation bar with the Create tab highlighted",
        instruction: "Go to roblox.com and click Create in the top navigation.",
        taglish: "Pumunta sa roblox.com, tapos i-click ang Create sa taas.",
      },
      {
        image: `${IMG}/02-create-experience.png`,
        imageWidth: 1400,
        imageHeight: 747,
        alt: "Roblox Create dashboard with the Create Experience button highlighted",
        instruction: "Click Create Experience.",
        taglish: "I-click ang Create Experience button.",
      },
      {
        image: `${IMG}/03-choose-baseplate.png`,
        imageWidth: 1400,
        imageHeight: 1149,
        alt: "Roblox Studio template picker with the Baseplate template highlighted",
        instruction:
          "Choose the Baseplate template. This gives you a simple, blank experience — exactly what you need.",
        taglish: "Piliin ang Baseplate template. Simple at blangko lang, tama na yun.",
      },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    title: "Publish Your Experience",
    intro: "Roblox Studio should now be open with your Baseplate loaded. Next, publish it so it has its own page on Roblox.",
    steps: [
      {
        image: `${IMG}/04-click-file.png`,
        imageWidth: 1400,
        imageHeight: 1465,
        alt: "Roblox Studio with the File menu highlighted",
        instruction: "In Roblox Studio, click File in the top-left corner.",
        taglish: "Sa Roblox Studio, i-click ang File sa kaliwang taas.",
      },
      {
        image: `${IMG}/05-publish-to-roblox-as.png`,
        imageWidth: 756,
        imageHeight: 1964,
        alt: "Roblox Studio File menu with Publish to Roblox As highlighted",
        instruction: "Click Publish to Roblox As.",
        taglish: "I-click ang Publish to Roblox As.",
      },
      {
        image: `${IMG}/06-create-new-experience.png`,
        imageWidth: 1400,
        imageHeight: 1116,
        alt: "Publish Experience dialog with Create new experience highlighted",
        instruction: "Click Create new experience.",
        taglish: "I-click ang Create new experience.",
      },
      {
        image: `${IMG}/07-name-and-create.png`,
        imageWidth: 1400,
        imageHeight: 1116,
        alt: "Basic Info dialog with a name field and the Create button highlighted",
        instruction: "Type any name for your experience, then click Create.",
        taglish: "Maglagay ng kahit anong pangalan, tapos i-click ang Create.",
      },
    ],
  },
  {
    id: "public",
    label: "Public",
    title: "Make It Public",
    intro: "Your experience is private by default. Let's open it up so it can be found.",
    steps: [
      {
        image: `${IMG}/08-open-your-experience.png`,
        imageWidth: 1400,
        imageHeight: 1980,
        alt: "Roblox Creator dashboard Home page with a newly created experience card",
        instruction: "Go back to the Roblox Creator dashboard and click your new experience.",
        taglish: "Balik sa Roblox Creator dashboard, tapos i-click yung bagong experience mo.",
      },
      {
        image: `${IMG}/09-configure-settings.png`,
        imageWidth: 1206,
        imageHeight: 2144,
        alt: "Creator dashboard sidebar with Configure and Settings highlighted",
        instruction: "In the left sidebar, click Configure, then Settings.",
        taglish: "Sa kaliwang sidebar, i-click ang Configure, tapos Settings.",
      },
      {
        image: `${IMG}/10-audience-public.png`,
        imageWidth: 1400,
        imageHeight: 1426,
        alt: "Content Settings page with the Audience section set to Public",
        instruction: "Under Audience, click Public.",
        taglish: "Sa ilalim ng Audience, i-click ang Public.",
        note: {
          title: "Seeing a permissions error?",
          body: "If Roblox says you don't have permission to publish to this audience, this is a Roblox account requirement (usually age verification) — not something wrong on your end. Check View my permissions on that screen, or verify your age in your Roblox account settings, then try again. Still stuck? Message us and we'll help you sort it out.",
          image: `${IMG}/extra-permission-notice.png`,
          imageWidth: 1400,
          imageHeight: 1399,
          imageAlt: "Roblox permissions notice blocking publishing to the Public audience",
        },
      },
    ],
  },
  {
    id: "questionnaire",
    label: "Questionnaire",
    title: "Complete the Questionnaire",
    intro: "Roblox asks a short content questionnaire before an experience can go public.",
    steps: [
      {
        image: `${IMG}/11-questionnaire-start.png`,
        imageWidth: 1400,
        imageHeight: 1368,
        alt: "Roblox Questionnaire Not Started screen with the Start button highlighted",
        instruction:
          "Click Start. If you're following this tutorial using a blank Baseplate with no added content, answer No to every question. If you added other content, answer truthfully based on what's actually in your experience.",
        taglish:
          "I-click ang Start. Kung blangkong Baseplate lang ito, sagutin ng 'No' lahat. Kung may nilagay ka na content, sagutin nang totoo.",
      },
      {
        image: `${IMG}/12-questionnaire-submit.png`,
        imageWidth: 1400,
        imageHeight: 1723,
        alt: "Questionnaire Preview screen with the Submit button highlighted",
        instruction: "Review your answers, then click Submit.",
        taglish: "I-review ang mga sagot, tapos i-click ang Submit.",
      },
      {
        image: `${IMG}/13-back-to-settings.png`,
        imageWidth: 669,
        imageHeight: 2726,
        alt: "Creator dashboard sidebar with Settings highlighted",
        instruction: "Go back to Configure, then Settings.",
        taglish: "Balik sa Configure, tapos Settings.",
      },
      {
        image: `${IMG}/14-make-public-again.png`,
        imageWidth: 1400,
        imageHeight: 1395,
        alt: "Content Settings page with Public selected under Audience",
        instruction: "Under Audience, make sure Public is selected again.",
        taglish: "Sa Audience, siguraduhing naka-select pa rin ang Public.",
      },
      {
        image: `${IMG}/15-save-changes.png`,
        imageWidth: 1400,
        imageHeight: 1451,
        alt: "Content Settings page scrolled down with the Save Changes button highlighted",
        instruction: "Scroll down and click Save Changes.",
        taglish: "Mag-scroll pababa, tapos i-click ang Save Changes.",
      },
    ],
  },
  {
    id: "pass",
    label: "Pass",
    title: "Create Your Game Pass",
    intro: "With your experience public, you can now create the gamepass itself.",
    steps: [
      {
        image: `${IMG}/16-monetization-passes.png`,
        imageWidth: 1227,
        imageHeight: 2879,
        alt: "Creator dashboard sidebar with Monetization and Passes highlighted",
        instruction: "In the sidebar, go to Monetization, then Passes.",
        taglish: "Sa sidebar, pumunta sa Monetization, tapos Passes.",
      },
      {
        image: `${IMG}/17-create-pass-button.png`,
        imageWidth: 1400,
        imageHeight: 761,
        alt: "Game passes page with the Create pass button highlighted",
        instruction: "Click Create Pass.",
        taglish: "I-click ang Create Pass.",
      },
      {
        image: `${IMG}/18-name-and-create-pass.png`,
        imageWidth: 1400,
        imageHeight: 1547,
        alt: "Create a Pass form with a name field",
        instruction: "Type any clear name for your pass, then click Create pass.",
        taglish: "Maglagay ng malinaw na pangalan, tapos i-click ang Create pass.",
      },
      {
        image: `${IMG}/19-edit-settings.png`,
        imageWidth: 1400,
        imageHeight: 749,
        alt: "Passes list with the three-dot menu open showing Edit settings",
        instruction: "Next to your new pass, click the three dots, then Edit settings.",
        taglish: "Sa tabi ng bagong pass, i-click ang tatlong tuldok, tapos Edit settings.",
      },
    ],
  },
  {
    id: "price",
    label: "Price",
    title: "Set Your Gamepass Price",
    intro: "Almost done — set the price BudgetWise gave you and you're ready to send us your link.",
    steps: [
      {
        image: `${IMG}/20-go-to-sales.png`,
        imageWidth: 915,
        imageHeight: 2042,
        alt: "Pass settings sidebar with the Sales tab highlighted",
        instruction: "Click Sales.",
        taglish: "I-click ang Sales.",
      },
      {
        image: `${IMG}/21-set-price-save.png`,
        imageWidth: 1400,
        imageHeight: 1163,
        alt: "Sales page with the price field filled in, Item for sale on, and Managed pricing off",
        instruction:
          "Turn on Item for sale, enter the exact price BudgetWise gave you, and click Save Changes.",
        taglish: "I-on ang Item for sale, ilagay ang eksaktong presyo na binigay namin, tapos i-click ang Save Changes.",
      },
    ],
  },
];

export const gamepassTutorialTotalSteps = gamepassTutorialStages.reduce(
  (sum, stage) => sum + stage.steps.length,
  0,
);

// Portrait screenshots tall enough that fitting them to card width would make
// the step awkwardly long — these get height-capped in the inline preview
// (see gamepass-tutorial-client.tsx) and a "Tap to enlarge" hint.
export function isTallScreenshot(width: number, height: number): boolean {
  return height / width > 1.35;
}
