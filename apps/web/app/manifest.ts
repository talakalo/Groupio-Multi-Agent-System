import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Groupio - הצעות קבוצתיות לבנייני מגורים",
    short_name: "Groupio",
    description:
      "פלטפורמה לרכישות קבוצתיות לדיירי בנייני מגורים. חסכו עד 40% על שירותים כמו מזגנים, מעליות ועוד.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#1a9a76",
    orientation: "portrait",
    dir: "rtl",
    lang: "he",
    icons: [
      {
        src: "/icons/icon-72x72.png",
        sizes: "72x72",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-96x96.png",
        sizes: "96x96",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-128x128.png",
        sizes: "128x128",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-144x144.png",
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-152x152.png",
        sizes: "152x152",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-384x384.png",
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/home.png",
        sizes: "1280x720",
        type: "image/png",
        label: "דף הבית",
      },
      {
        src: "/screenshots/offers.png",
        sizes: "1280x720",
        type: "image/png",
        label: "הצעות",
      },
      {
        src: "/screenshots/mobile.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "תצוגה ניידת",
      },
    ],
    categories: ["business", "shopping", "utilities"],
    shortcuts: [
      {
        name: "הצעות פעילות",
        short_name: "הצעות",
        description: "צפייה בהצעות קבוצתיות פעילות",
        url: "/offers?status=active",
        icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
      },
      {
        name: "הבניין שלי",
        short_name: "בניין",
        description: "ניהול הבניין והדיירים",
        url: "/building",
        icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
      },
    ],
    related_applications: [
      {
        platform: "play",
        url: "https://play.google.com/store/apps/details?id=il.co.groupio",
        id: "il.co.groupio",
      },
      {
        platform: "itunes",
        url: "https://apps.apple.com/il/app/groupio/id1234567890",
      },
    ],
    prefer_related_applications: false,
  };
}
