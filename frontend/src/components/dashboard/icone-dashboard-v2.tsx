import estilosV2 from "./dashboard-v2.module.css";

// Códigos da fonte Remix Icon 4.5.0 incluída no ZIP de referência.
const glifos = {
  "home-5-line": "\uee1f",
  "calendar-2-line": "\ueb21",
  "arrow-down-s-line": "\uea4e",
  "calendar-line": "\ueb27",
  "layout-grid-fill": "\uee8f",
  "bar-chart-box-fill": "\uea97",
  "layout-grid-line": "\uee90",
  "pulse-line": "\uf035",
  "funds-line": "\ueda3",
  "sparkling-2-line": "\uf36b",
  "customer-service-2-fill": "\uec0b",
  "user-add-fill": "\uf25d",
  "hourglass-fill": "\uf338",
  "shopping-bag-3-fill": "\uf115",
  "percent-fill": "\uefe5",
  "star-fill": "\uf186",
  "robot-2-fill": "\uf3d8",
  "user-voice-fill": "\uf279",
  "emotion-happy-fill": "\uec8c",
  "arrow-left-right-line": "\uea62",
  "user-unfollow-fill": "\uf277",
  "arrow-up-line": "\uea76",
  "arrow-down-line": "\uea4c",
  "arrow-right-up-line": "\uea70",
} as const;

export function IconeDashboardV2({ nome }: { nome: keyof typeof glifos }) {
  return <span className={estilosV2.icone} aria-hidden="true">{glifos[nome]}</span>;
}
