import dailyCueScreenshot from "@/assets/promotions/daily-cue-keeper.png";
import kalenderScreenshot from "@/assets/promotions/kalender-deutschland.png";
import linkoraScreenshot from "@/assets/promotions/linkora.jpg";
import linkoraV2Screenshot from "@/assets/promotions/linkora-v2.png";
import mixlabScreenshot from "@/assets/promotions/mixlab.png";
import tasteTraceScreenshot from "@/assets/promotions/taste-and-trace.png";

export interface Promotion {
  id: string;
  published: boolean;
  titleKey: string;
  descriptionKey: string;
  detailsKey: string;
  screenshotUrl: string;
  repoUrl: string;
  downloadUrl?: string;
  accent: string;
}

const repo = (name: string) => `https://github.com/milleran41/${name}`;
const latestRelease = (name: string) => `${repo(name)}/releases/latest`;
const repoPreview = (name: string) => `https://opengraph.githubassets.com/yumbook-${name}/milleran41/${name}`;

export const promotions: Promotion[] = [
  {
    id: "german-law-buddy",
    published: false,
    titleKey: "promo_german_law_buddy_title",
    descriptionKey: "promo_german_law_buddy_description",
    detailsKey: "promo_german_law_buddy_details",
    screenshotUrl: repoPreview("german-law-buddy"),
    repoUrl: repo("german-law-buddy"),
    downloadUrl: latestRelease("german-law-buddy"),
    accent: "from-lime-100 to-emerald-50 text-emerald-700",
  },
  {
    id: "daily-cue-keeper",
    published: true,
    titleKey: "promo_daily_cue_keeper_title",
    descriptionKey: "promo_daily_cue_keeper_description",
    detailsKey: "promo_daily_cue_keeper_details",
    screenshotUrl: dailyCueScreenshot,
    repoUrl: repo("daily-cue-keeper"),
    downloadUrl: latestRelease("daily-cue-keeper"),
    accent: "from-sky-100 to-cyan-50 text-sky-700",
  },
  {
    id: "taste-and-trace",
    published: true,
    titleKey: "promo_taste_and_trace_title",
    descriptionKey: "promo_taste_and_trace_description",
    detailsKey: "promo_taste_and_trace_details",
    screenshotUrl: tasteTraceScreenshot,
    repoUrl: repo("taste-and-trace"),
    accent: "from-orange-100 to-amber-50 text-orange-700",
  },
  {
    id: "linkora",
    published: true,
    titleKey: "promo_linkora_title",
    descriptionKey: "promo_linkora_description",
    detailsKey: "promo_linkora_details",
    screenshotUrl: linkoraScreenshot,
    repoUrl: repo("linkora"),
    downloadUrl: latestRelease("linkora"),
    accent: "from-violet-100 to-fuchsia-50 text-violet-700",
  },
  {
    id: "mixlab",
    published: false,
    titleKey: "promo_mixlab_title",
    descriptionKey: "promo_mixlab_description",
    detailsKey: "promo_mixlab_details",
    screenshotUrl: mixlabScreenshot,
    repoUrl: repo("MixLab"),
    downloadUrl: latestRelease("MixLab"),
    accent: "from-rose-100 to-pink-50 text-rose-700",
  },
  {
    id: "linkora-v2",
    published: true,
    titleKey: "promo_linkora_v2_title",
    descriptionKey: "promo_linkora_v2_description",
    detailsKey: "promo_linkora_v2_details",
    screenshotUrl: linkoraV2Screenshot,
    repoUrl: repo("linkora-v2"),
    downloadUrl: latestRelease("linkora-v2"),
    accent: "from-indigo-100 to-blue-50 text-indigo-700",
  },
  {
    id: "kalender-deutschland",
    published: true,
    titleKey: "promo_kalender_deutschland_title",
    descriptionKey: "promo_kalender_deutschland_description",
    detailsKey: "promo_kalender_deutschland_details",
    screenshotUrl: kalenderScreenshot,
    repoUrl: repo("kalender-deutschland"),
    downloadUrl: latestRelease("kalender-deutschland"),
    accent: "from-teal-100 to-lime-50 text-teal-700",
  },
];
