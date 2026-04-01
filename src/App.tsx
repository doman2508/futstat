import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  parsePlayersOcr,
  parseSummaryOcr,
  recognizePlayersScreenshot,
  recognizeSummaryScreenshot,
  type CropBox,
  type SummaryCropSettings,
  type PlayerOcrSuggestion,
  type SummaryOcrSuggestion
} from "./ocr";

type Result = "win" | "draw" | "loss";
type OpponentStyle =
  | "balanced"
  | "high-press"
  | "five-back"
  | "counter"
  | "possession";

type TeamStatKey =
  | "possession"
  | "shots"
  | "expectedGoals"
  | "passes"
  | "passAccuracy"
  | "tackles"
  | "successfulTackles"
  | "interceptions"
  | "saves"
  | "fouls"
  | "offsides"
  | "corners"
  | "freeKicks"
  | "yellowCards"
  | "redCards";

type PlayerStatKey =
  | "goals"
  | "assists"
  | "shots"
  | "shotAccuracy"
  | "passes"
  | "passAccuracy"
  | "dribbles"
  | "dribbleAccuracy"
  | "tackles"
  | "tackleAccuracy"
  | "offsides"
  | "fouls"
  | "possessionWon"
  | "possessionLost"
  | "distanceKm"
  | "sprints";

type TeamStats = Record<TeamStatKey, number>;
type PlayerStats = Record<PlayerStatKey, number>;

type PlayerEntry = {
  id: string;
  name: string;
  position: string;
  rating: number;
  stats: PlayerStats;
};

type ScreenshotAsset = {
  name: string;
  dataUrl: string;
};

type OcrState<T> = {
  status: "idle" | "running" | "done" | "error";
  result: T | null;
  error: string | null;
};

type CropForm = {
  x: string;
  y: string;
  width: string;
  height: string;
};

type TeamSide = "left" | "right";
type MainTab = "przeglad" | "dodaj" | "historia" | "szczegoly" | "sklady";

type SquadPlayer = {
  id: string;
  name: string;
  position: string;
  rating: number;
};

type SquadEntry = {
  id: string;
  name: string;
  formation: string;
  players: SquadPlayer[];
  isDefault?: boolean;
};

type SquadPlayerAggregate = {
  name: string;
  position: string;
  rating: number;
  matches: number;
  goals: number;
  assists: number;
  averageMatchRating: number;
};

type MatchEntry = {
  id: string;
  playedAt: string;
  result: Result;
  goalsFor: number;
  goalsAgainst: number;
  squadId?: string;
  squadName: string;
  squadFormation: string;
  opponentName: string;
  opponentFormation: string;
  opponentStyle: OpponentStyle;
  teamStats: TeamStats;
  opponentStats: TeamStats;
  playerEntries: PlayerEntry[];
  summaryScreenshot?: ScreenshotAsset | null;
  playersScreenshot?: ScreenshotAsset | null;
  notes: string;
};

type MatchForm = {
  playedAt: string;
  result: Result;
  goalsFor: string;
  goalsAgainst: string;
  squadId: string;
  squadName: string;
  squadFormation: string;
  opponentName: string;
  opponentFormation: string;
  opponentStyle: OpponentStyle;
  teamStats: Record<TeamStatKey, string>;
  opponentStats: Record<TeamStatKey, string>;
  notes: string;
};

const STORAGE_KEY = "futstat.matches";
const SQUADS_STORAGE_KEY = "futstat.squads";

const teamStatFields: { key: TeamStatKey; label: string; step?: string }[] = [
  { key: "possession", label: "Posiadanie pilki %", step: "1" },
  { key: "shots", label: "Strzaly", step: "1" },
  { key: "expectedGoals", label: "Oczekiwane bramki", step: "0.1" },
  { key: "passes", label: "Podania", step: "1" },
  { key: "passAccuracy", label: "Dokladnosc podan %", step: "1" },
  { key: "tackles", label: "Odbiory", step: "1" },
  { key: "successfulTackles", label: "Udane odbiory", step: "1" },
  { key: "interceptions", label: "Przechwyty", step: "1" },
  { key: "saves", label: "Obrony", step: "1" },
  { key: "fouls", label: "Popelnione faule", step: "1" },
  { key: "offsides", label: "Spalone", step: "1" },
  { key: "corners", label: "Rzuty rozne", step: "1" },
  { key: "freeKicks", label: "Rzuty wolne", step: "1" },
  { key: "yellowCards", label: "Zolte kartki", step: "1" },
  { key: "redCards", label: "Czerwone kartki", step: "1" }
];

const playerStatFields: { key: PlayerStatKey; label: string; step?: string }[] = [
  { key: "goals", label: "Bramki", step: "1" },
  { key: "assists", label: "Asysty", step: "1" },
  { key: "shots", label: "Strzaly", step: "1" },
  { key: "shotAccuracy", label: "Cel. strzalow %", step: "1" },
  { key: "passes", label: "Podania", step: "1" },
  { key: "passAccuracy", label: "Dokl. podan %", step: "1" },
  { key: "dribbles", label: "Dryblingi", step: "1" },
  { key: "dribbleAccuracy", label: "Skut. dryblingu %", step: "1" },
  { key: "tackles", label: "Odbiory", step: "1" },
  { key: "tackleAccuracy", label: "Udane odbiory %", step: "1" },
  { key: "offsides", label: "Spalone", step: "1" },
  { key: "fouls", label: "Faule", step: "1" },
  { key: "possessionWon", label: "Odzyskane pilki", step: "1" },
  { key: "possessionLost", label: "Straty pilki", step: "1" },
  { key: "distanceKm", label: "Dystans km", step: "0.1" },
  { key: "sprints", label: "Sprinty", step: "1" }
];

const opponentStyles: { value: OpponentStyle; label: string }[] = [
  { value: "balanced", label: "Zbalansowany" },
  { value: "high-press", label: "Wysoki pressing" },
  { value: "five-back", label: "Piatka z tylu" },
  { value: "counter", label: "Kontra" },
  { value: "possession", label: "Posiadanie" }
];

function createNumericRecord<T extends string>(fields: readonly T[], value = "0") {
  return fields.reduce(
    (accumulator, field) => ({
      ...accumulator,
      [field]: value
    }),
    {} as Record<T, string>
  );
}

const teamStatKeys = teamStatFields.map((field) => field.key);
const playerStatKeys = playerStatFields.map((field) => field.key);

const createDefaultTeamStats = () => createNumericRecord(teamStatKeys);
const createDefaultPlayerStats = () => createNumericRecord(playerStatKeys);

const defaultForm = (): MatchForm => ({
  playedAt: new Date().toISOString().slice(0, 16),
  result: "win",
  goalsFor: "4",
  goalsAgainst: "",
  squadId: "",
  squadName: "Moj sklad WL",
  squadFormation: "4-2-3-1",
  opponentName: "Przeciwnik FUT Champions",
  opponentFormation: "4-2-3-1",
  opponentStyle: "balanced",
  teamStats: {
    ...createDefaultTeamStats(),
    possession: "54",
    shots: "8",
    expectedGoals: "1.6",
    passes: "121",
    passAccuracy: "82",
    tackles: "44",
    successfulTackles: "17",
    interceptions: "15",
    saves: "2",
    fouls: "0",
    offsides: "2",
    corners: "4",
    freeKicks: "0",
    yellowCards: "1",
    redCards: "0"
  },
  opponentStats: {
    ...createDefaultTeamStats(),
    possession: "46",
    shots: "6",
    expectedGoals: "1.2",
    passes: "98",
    passAccuracy: "78",
    tackles: "35",
    successfulTackles: "12",
    interceptions: "9",
    saves: "3",
    fouls: "1",
    offsides: "1",
    corners: "2",
    freeKicks: "0",
    yellowCards: "0",
    redCards: "0"
  },
  notes: ""
});

const defaultSquadPlayerForm = () => ({
  name: "",
  position: "ST",
  rating: "82"
});

const defaultSquadForm = () => ({
  name: "Moj sklad WL",
  formation: "4-2-3-1"
});

const defaultSummaryScoreCrop = (): CropForm => ({
  x: "0.26",
  y: "0.02",
  width: "0.48",
  height: "0.16"
});

const defaultSummaryStatsCrop = (): CropForm => ({
  x: "0.17",
  y: "0.16",
  width: "0.66",
  height: "0.58"
});

const defaultPlayersCrop = (): CropForm => ({
  x: "0.02",
  y: "0.12",
  width: "0.42",
  height: "0.76"
});

function parseNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampCropValue(value: string, fallback: number) {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

function toCropBox(form: CropForm, fallback: CropBox): CropBox {
  return {
    x: clampCropValue(form.x, fallback.x),
    y: clampCropValue(form.y, fallback.y),
    width: clampCropValue(form.width, fallback.width),
    height: clampCropValue(form.height, fallback.height)
  };
}

function toTeamStats(record: Record<TeamStatKey, string>): TeamStats {
  return teamStatKeys.reduce(
    (accumulator, key) => ({
      ...accumulator,
      [key]: parseNumber(record[key])
    }),
    {} as TeamStats
  );
}

function toPlayerStats(record: Record<PlayerStatKey, string>): PlayerStats {
  return playerStatKeys.reduce(
    (accumulator, key) => ({
      ...accumulator,
      [key]: parseNumber(record[key])
    }),
    {} as PlayerStats
  );
}

function formatResult(result: Result) {
  return result === "win" ? "Wygrana" : result === "loss" ? "Porazka" : "Remis";
}

function formatOpponentStyle(style: OpponentStyle) {
  return opponentStyles.find((entry) => entry.value === style)?.label ?? style;
}

function normalizePlayerLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function playerTokens(value: string) {
  return normalizePlayerLookup(value)
    .split(" ")
    .map((token) => token.replace(/\./g, ""))
    .filter(Boolean);
}

function isSamePlayerName(ocrName: string, squadName: string) {
  const ocrTokens = playerTokens(ocrName);
  const squadTokens = playerTokens(squadName);

  if (ocrTokens.length === 0 || squadTokens.length === 0) {
    return false;
  }

  const ocrJoined = ocrTokens.join(" ");
  const squadJoined = squadTokens.join(" ");

  if (ocrJoined === squadJoined || ocrJoined.includes(squadJoined) || squadJoined.includes(ocrJoined)) {
    return true;
  }

  const ocrLast = ocrTokens[ocrTokens.length - 1];
  const squadLast = squadTokens[squadTokens.length - 1];

  if (ocrLast && squadLast && ocrLast === squadLast) {
    const ocrFirst = ocrTokens[0];
    const squadFirst = squadTokens[0];

    if (!ocrFirst || !squadFirst) {
      return true;
    }

    return ocrFirst === squadFirst || ocrFirst.charAt(0) === squadFirst.charAt(0);
  }

  return false;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Nie udalo sie wczytac pliku."));
    reader.readAsDataURL(file);
  });
}

function CropInputs({
  title,
  value,
  onChange
}: {
  title: string;
  value: CropForm;
  onChange: (next: CropForm) => void;
}) {
  const fields: { key: keyof CropForm; label: string }[] = [
    { key: "x", label: "X" },
    { key: "y", label: "Y" },
    { key: "width", label: "Szer." },
    { key: "height", label: "Wys." }
  ];

  return (
    <div className="crop-box">
      <strong>{title}</strong>
      <div className="crop-grid">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={value[field.key]}
              onChange={(event) =>
                onChange({
                  ...value,
                  [field.key]: event.target.value
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function buildSquadAggregates(squad: SquadEntry, matches: MatchEntry[]): SquadPlayerAggregate[] {
  const squadMatches = matches.filter((match) => match.squadId === squad.id);

  return squad.players
    .map((player) => {
      const relatedEntries = squadMatches
        .flatMap((match) => match.playerEntries)
        .filter((entry) => entry.name.toLowerCase() === player.name.toLowerCase());

      const matchesCount = relatedEntries.length;
      const goals = relatedEntries.reduce((sum, entry) => sum + entry.stats.goals, 0);
      const assists = relatedEntries.reduce((sum, entry) => sum + entry.stats.assists, 0);
      const averageMatchRating =
        matchesCount === 0
          ? player.rating
          : Number(
              (
                relatedEntries.reduce((sum, entry) => sum + entry.rating, 0) / matchesCount
              ).toFixed(2)
            );

      return {
        name: player.name,
        position: player.position,
        rating: player.rating,
        matches: matchesCount,
        goals,
        assists,
        averageMatchRating
      };
    })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
}

function App() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [squads, setSquads] = useState<SquadEntry[]>([]);
  const [form, setForm] = useState<MatchForm>(defaultForm);
  const [squadForm, setSquadForm] = useState(defaultSquadForm);
  const [squadPlayerForm, setSquadPlayerForm] = useState(defaultSquadPlayerForm);
  const [squadPlayersDraft, setSquadPlayersDraft] = useState<SquadPlayer[]>([]);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [summaryScreenshot, setSummaryScreenshot] = useState<ScreenshotAsset | null>(null);
  const [playersScreenshot, setPlayersScreenshot] = useState<ScreenshotAsset | null>(null);
  const [summaryOcr, setSummaryOcr] = useState<OcrState<SummaryOcrSuggestion>>({
    status: "idle",
    result: null,
    error: null
  });
  const [playersOcr, setPlayersOcr] = useState<OcrState<PlayerOcrSuggestion[]>>({
    status: "idle",
    result: null,
    error: null
  });
  const [summaryScoreCrop, setSummaryScoreCrop] = useState<CropForm>(defaultSummaryScoreCrop);
  const [summaryStatsCrop, setSummaryStatsCrop] = useState<CropForm>(defaultSummaryStatsCrop);
  const [playersCrop, setPlayersCrop] = useState<CropForm>(defaultPlayersCrop);
  const [myTeamSide, setMyTeamSide] = useState<TeamSide>("right");
  const [ocrApplyMessage, setOcrApplyMessage] = useState("");
  const [activeTab, setActiveTab] = useState<MainTab>("przeglad");
  const [matchesHydrated, setMatchesHydrated] = useState(false);
  const [squadsHydrated, setSquadsHydrated] = useState(false);
  const [editingSquadId, setEditingSquadId] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      setMatchesHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as MatchEntry[];
      setMatches(parsed);
      if (parsed[0]) {
        setSelectedMatchId(parsed[0].id);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setMatchesHydrated(true);
    }
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(SQUADS_STORAGE_KEY);

    if (!raw) {
      setSquadsHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SquadEntry[];
      setSquads(parsed);
      if (parsed[0]) {
        setForm((current) => ({
          ...current,
          squadId: parsed[0].id,
          squadName: parsed[0].name,
          squadFormation: parsed[0].formation
        }));
      }
    } catch {
      window.localStorage.removeItem(SQUADS_STORAGE_KEY);
    } finally {
      setSquadsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!matchesHydrated) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
  }, [matches, matchesHydrated]);

  useEffect(() => {
    if (!squadsHydrated) {
      return;
    }
    window.localStorage.setItem(SQUADS_STORAGE_KEY, JSON.stringify(squads));
  }, [squads, squadsHydrated]);

  const selectedMatch =
    matches.find((match) => match.id === selectedMatchId) ?? matches[0] ?? null;

  const computedGoalsFor = useMemo(
    () => players.reduce((sum, player) => sum + player.stats.goals, 0),
    [players]
  );

  const computedResult: Result =
    computedGoalsFor > parseNumber(form.goalsAgainst)
      ? "win"
      : computedGoalsFor < parseNumber(form.goalsAgainst)
        ? "loss"
        : "draw";

  const squadAnalytics = useMemo(() => {
    return squads.map((squad) => ({
      squad,
      players: buildSquadAggregates(squad, matches)
    }));
  }, [squads, matches]);

  const selectedSquadAnalytics =
    squadAnalytics.find((entry) => entry.squad.id === form.squadId) ?? squadAnalytics[0] ?? null;

  const stats = useMemo(() => {
    const total = matches.length;
    const wins = matches.filter((match) => match.result === "win").length;
    const draws = matches.filter((match) => match.result === "draw").length;
    const losses = total - wins - draws;
    const goalDiff = matches.reduce(
      (sum, match) => sum + (match.goalsFor - match.goalsAgainst),
      0
    );

    const currentStreak = (() => {
      if (matches.length === 0) {
        return { label: "Brak serii", size: 0 };
      }

      const latestResult = matches[0].result;
      let size = 0;

      for (const match of matches) {
        if (match.result !== latestResult) {
          break;
        }
        size += 1;
      }

      return {
        label: `${size} x ${formatResult(latestResult).toLowerCase()}`,
        size
      };
    })();

    const bestHour = (() => {
      if (total === 0) {
        return "Brak danych";
      }

      const hourBuckets = new Map<number, { games: number; wins: number }>();

      for (const match of matches) {
        const hour = new Date(match.playedAt).getHours();
        const bucket = hourBuckets.get(hour) ?? { games: 0, wins: 0 };
        bucket.games += 1;
        bucket.wins += match.result === "win" ? 1 : 0;
        hourBuckets.set(hour, bucket);
      }

      const [hour, bucket] = [...hourBuckets.entries()].sort((a, b) => {
        const aRate = a[1].wins / a[1].games;
        const bRate = b[1].wins / b[1].games;

        if (bRate !== aRate) {
          return bRate - aRate;
        }

        return b[1].games - a[1].games;
      })[0];

      return `${hour.toString().padStart(2, "0")}:00 (${Math.round(
        (bucket.wins / bucket.games) * 100
      )}% WR)`;
    })();

    const worstMatchup = (() => {
      if (total === 0) {
        return "Brak danych o matchupach";
      }

      const styleBuckets = new Map<OpponentStyle, { games: number; wins: number }>();

      for (const match of matches) {
        const bucket = styleBuckets.get(match.opponentStyle) ?? { games: 0, wins: 0 };
        bucket.games += 1;
        bucket.wins += match.result === "win" ? 1 : 0;
        styleBuckets.set(match.opponentStyle, bucket);
      }

      const [style, bucket] = [...styleBuckets.entries()].sort((a, b) => {
        const aRate = a[1].wins / a[1].games;
        const bRate = b[1].wins / b[1].games;

        if (aRate !== bRate) {
          return aRate - bRate;
        }

        return b[1].games - a[1].games;
      })[0];

      return `${formatOpponentStyle(style)} (${Math.round((bucket.wins / bucket.games) * 100)}% WR)`;
    })();

    const ratings = matches.flatMap((match) =>
      match.playerEntries.map((player) => player.rating)
    );
    const averagePlayerRating =
      ratings.length === 0
        ? 0
        : Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2));

    const topScorer = (() => {
      const scorers = new Map<string, number>();
      for (const match of matches) {
        for (const player of match.playerEntries) {
          scorers.set(player.name, (scorers.get(player.name) ?? 0) + player.stats.goals);
        }
      }
      const ranked = [...scorers.entries()].sort((a, b) => b[1] - a[1]);
      return ranked[0] ? `${ranked[0][0]} (${ranked[0][1]})` : "Brak danych o zawodnikach";
    })();

    const recommendation = (() => {
      if (matches.length < 2) {
        return "Zapisz pelne statystyki meczu i 2-3 karty zawodnikow. To szybko odblokuje lepsze sugestie sesji.";
      }

      const recentTwo = matches.slice(0, 2);
      const lostTwoStraight = recentTwo.every((match) => match.result === "loss");

      if (lostTwoStraight) {
        return "Alert tilt: dwie porazki z rzedu. Zrob przerwe przed kolejnym meczem.";
      }

      if (selectedMatch && selectedMatch.playerEntries.length < 3) {
        return "Masz juz mecze, ale wciaz malo danych o zawodnikach. Dodawaj po meczu kluczowych napastnikow i pomocnikow.";
      }

      if (currentStreak.size >= 3 && matches[0]?.result === "win") {
        return "Masz dobry rytm. Trzymaj to samo tempo sesji i nie zmieniaj teraz ustawien.";
      }

      return `Najlepiej idzie ci o ${bestHour}. Warto planowac kolejna sesje wokol tej godziny.`;
    })();

    return {
      total,
      wins,
      draws,
      losses,
      goalDiff,
      averagePlayerRating,
      winRate: total === 0 ? 0 : Math.round((wins / total) * 100),
      currentStreak,
      bestHour,
      worstMatchup,
      topScorer,
      recommendation
    };
  }, [matches, selectedMatch]);

  const addSquadPlayerToDraft = () => {
    if (!squadPlayerForm.name.trim()) {
      return;
    }

    setSquadPlayersDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: squadPlayerForm.name.trim(),
        position: squadPlayerForm.position.trim() || "ST",
        rating: parseNumber(squadPlayerForm.rating)
      }
    ]);

    setSquadPlayerForm(defaultSquadPlayerForm());
  };

  const removeSquadDraftPlayer = (id: string) => {
    setSquadPlayersDraft((current) => current.filter((player) => player.id !== id));
  };

  const startEditingSquad = (squad: SquadEntry) => {
    setEditingSquadId(squad.id);
    setSquadForm({
      name: squad.name,
      formation: squad.formation
    });
    setSquadPlayersDraft(
      squad.players.map((player) => ({
        ...player,
        id: crypto.randomUUID()
      }))
    );
    setSquadPlayerForm(defaultSquadPlayerForm());
    setActiveTab("sklady");
    setOcrApplyMessage(`Edytujesz sklad "${squad.name}".`);
  };

  const cancelSquadEditing = () => {
    setEditingSquadId(null);
    setSquadForm(defaultSquadForm());
    setSquadPlayersDraft([]);
    setSquadPlayerForm(defaultSquadPlayerForm());
    setOcrApplyMessage("Anulowano edycje skladu.");
  };

  const saveSquad = () => {
    if (!squadForm.name.trim()) {
      return;
    }

    const normalizedName = squadForm.name.trim().toLowerCase();
    const duplicate = squads.find(
      (squad) => squad.name.trim().toLowerCase() === normalizedName && squad.id !== editingSquadId
    );

    if (duplicate) {
      setOcrApplyMessage(`Sklad "${squadForm.name.trim()}" juz istnieje. Edytuj go zamiast dodawac drugi.`);
      return;
    }

    const nextSquad: SquadEntry = {
      id: editingSquadId ?? crypto.randomUUID(),
      name: squadForm.name.trim(),
      formation: squadForm.formation.trim() || "4-2-3-1",
      players: squadPlayersDraft
    };

    setSquads((current) =>
      editingSquadId
        ? current.map((squad) => (squad.id === editingSquadId ? nextSquad : squad))
        : [nextSquad, ...current]
    );
    setForm((current) => ({
      ...current,
      squadId: nextSquad.id,
      squadName: nextSquad.name,
      squadFormation: nextSquad.formation
    }));
    setEditingSquadId(null);
    setSquadForm(defaultSquadForm());
    setSquadPlayersDraft([]);
    setSquadPlayerForm(defaultSquadPlayerForm());
    setOcrApplyMessage(
      editingSquadId
        ? `Zmiany w skladzie "${nextSquad.name}" zostaly zapisane.`
        : `Sklad "${nextSquad.name}" zostal zapisany i ustawiony do kolejnego meczu.`
    );
  };

  const deleteSquad = (id: string) => {
    setSquads((current) => current.filter((squad) => squad.id !== id));
    if (editingSquadId === id) {
      setEditingSquadId(null);
      setSquadForm(defaultSquadForm());
      setSquadPlayersDraft([]);
      setSquadPlayerForm(defaultSquadPlayerForm());
    }
    if (form.squadId === id) {
      setForm((current) => ({
        ...current,
        squadId: "",
        squadName: "",
        squadFormation: ""
      }));
    }
  };

  const applySquadToMatch = (squad: SquadEntry) => {
    setForm((current) => ({
      ...current,
      squadId: squad.id,
      squadName: squad.name,
      squadFormation: squad.formation
    }));

    setPlayers(
      squad.players.map((player) => ({
        id: crypto.randomUUID(),
        name: player.name,
        position: player.position,
        rating: player.rating,
        stats: toPlayerStats(createDefaultPlayerStats())
      }))
    );

    setOcrApplyMessage(`Sklad "${squad.name}" zostal wczytany do meczu.`);
  };

  const copySquadFromLastMatch = () => {
    const lastMatch = matches[0];

    if (!lastMatch) {
      return;
    }

    setForm((current) => ({
      ...current,
      squadName: lastMatch.squadName,
      squadFormation: lastMatch.squadFormation
    }));

    setPlayers(
      lastMatch.playerEntries.map((player) => ({
        ...player,
        id: crypto.randomUUID(),
        stats: {
          ...toPlayerStats(createDefaultPlayerStats())
        }
      }))
    );

    setOcrApplyMessage("Sklad z ostatniego meczu zostal skopiowany. Teraz dopisz statystyki po spotkaniu.");
  };

  const handleScreenshotUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    type: "summary" | "players"
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    const asset = { name: file.name, dataUrl };

    if (type === "summary") {
      setSummaryScreenshot(asset);
      setSummaryOcr({ status: "idle", result: null, error: null });
    } else {
      setPlayersScreenshot(asset);
      setPlayersOcr({ status: "idle", result: null, error: null });
    }

    setOcrApplyMessage("");
    event.target.value = "";
  };

  const runSummaryOcr = async () => {
    if (!summaryScreenshot) {
      return;
    }

    setSummaryOcr({ status: "running", result: null, error: null });

    try {
      const cropSettings: SummaryCropSettings = {
        score: toCropBox(summaryScoreCrop, { x: 0.26, y: 0.02, width: 0.48, height: 0.16 }),
        stats: toCropBox(summaryStatsCrop, { x: 0.17, y: 0.16, width: 0.66, height: 0.58 })
      };
      const ocrResult = await recognizeSummaryScreenshot(summaryScreenshot.dataUrl, cropSettings);
      const parsed = parseSummaryOcr(ocrResult.combinedText);
      setSummaryOcr({ status: "done", result: parsed, error: null });
    } catch (error) {
      setSummaryOcr({
        status: "error",
        result: null,
        error: error instanceof Error ? error.message : "Nie udalo sie odczytac screena."
      });
    }
  };

  const runPlayersOcr = async () => {
    if (!playersScreenshot) {
      return;
    }

    setPlayersOcr({ status: "running", result: null, error: null });

    try {
      const cropBox = toCropBox(playersCrop, { x: 0.02, y: 0.12, width: 0.42, height: 0.76 });
      const text = await recognizePlayersScreenshot(playersScreenshot.dataUrl, cropBox);
      const parsed = parsePlayersOcr(text);
      setPlayersOcr({ status: "done", result: parsed, error: null });
    } catch (error) {
      setPlayersOcr({
        status: "error",
        result: null,
        error: error instanceof Error ? error.message : "Nie udalo sie odczytac screena."
      });
    }
  };

  const applySummaryOcr = () => {
    const summaryResult = summaryOcr.result;

    if (!summaryResult) {
      return;
    }

    setForm((current) => {
      const next = {
        ...current,
        teamStats: { ...current.teamStats },
        opponentStats: { ...current.opponentStats }
      };

      const isMyTeamLeft = myTeamSide === "left";

      if (summaryResult.score) {
        const goalsFor = isMyTeamLeft ? summaryResult.score.left : summaryResult.score.right;
        const goalsAgainst = isMyTeamLeft ? summaryResult.score.right : summaryResult.score.left;
        const goalsForNumber = parseNumber(goalsFor);
        const goalsAgainstNumber = parseNumber(goalsAgainst);

        next.goalsFor = goalsFor;
        next.goalsAgainst = goalsAgainst;
        next.result =
          goalsForNumber > goalsAgainstNumber
            ? "win"
            : goalsForNumber < goalsAgainstNumber
              ? "loss"
              : "draw";
      }

      for (const [key, value] of Object.entries(summaryResult.teamStats)) {
        const myValue = isMyTeamLeft ? value : summaryResult.opponentStats[key] ?? value;
        next.teamStats[key as TeamStatKey] = myValue;
      }

      return next;
    });

    setOcrApplyMessage("Dane z OCR zostaly wstawione do formularza.");
  };

  const applyPlayersOcr = () => {
    if (!playersOcr.result || playersOcr.result.length === 0) {
      return;
    }

    let matchedCount = 0;

    setPlayers((current) => {
      if (current.length === 0) {
        return current;
      }

      return current.map((entry) => {
        const matched = playersOcr.result?.find(
          (player) => isSamePlayerName(player.name, entry.name)
        );

        if (!matched) {
          return entry;
        }

        matchedCount += 1;

        return {
          ...entry,
          rating: parseNumber(matched.rating),
          stats: {
            ...entry.stats,
            goals: parseNumber(matched.goals),
            assists: parseNumber(matched.assists)
          }
        };
      });
    });

    setOcrApplyMessage(
      matchedCount > 0
        ? `OCR uzupelnil oceny, gole i asysty dla ${matchedCount} zawodnikow ze skladu.`
        : "OCR odczytal tabele, ale nie dopasowal jeszcze nazwisk do skladu."
    );
  };

  const addMatch = () => {
    const nextMatch: MatchEntry = {
      id: crypto.randomUUID(),
      playedAt: form.playedAt,
      result:
        computedGoalsFor > parseNumber(form.goalsAgainst)
          ? "win"
          : computedGoalsFor < parseNumber(form.goalsAgainst)
            ? "loss"
            : "draw",
      goalsFor: computedGoalsFor,
      goalsAgainst: parseNumber(form.goalsAgainst),
      squadId: form.squadId || undefined,
      squadName: form.squadName.trim() || "Moj sklad WL",
      squadFormation: form.squadFormation.trim() || "4-2-3-1",
      opponentName: form.opponentName.trim() || "Przeciwnik FUT Champions",
      opponentFormation: form.opponentFormation.trim(),
      opponentStyle: form.opponentStyle,
      teamStats: toTeamStats(form.teamStats),
      opponentStats: toTeamStats(createDefaultTeamStats()),
      playerEntries: players,
      summaryScreenshot,
      playersScreenshot,
      notes: form.notes.trim()
    };

    setMatches((current) => {
      const nextMatches = [nextMatch, ...current].sort(
        (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
      );
      setSelectedMatchId(nextMatch.id);
      return nextMatches;
    });

    setForm(() => {
      const nextDefault = defaultForm();
      const selectedSquad = squads.find((squad) => squad.id === form.squadId) ?? squads[0];

      if (!selectedSquad) {
        return nextDefault;
      }

      return {
        ...nextDefault,
        squadId: selectedSquad.id,
        squadName: selectedSquad.name,
        squadFormation: selectedSquad.formation
      };
    });
    setPlayers([]);
    setSummaryScreenshot(null);
    setPlayersScreenshot(null);
    setSummaryOcr({ status: "idle", result: null, error: null });
    setPlayersOcr({ status: "idle", result: null, error: null });
    setOcrApplyMessage("");
  };

  const removeMatch = (id: string) => {
    setMatches((current) => current.filter((match) => match.id !== id));
    if (selectedMatchId === id) {
      setSelectedMatchId(null);
    }
  };

  const navItems: { id: MainTab; label: string; icon: string }[] = [
    { id: "przeglad", label: "Weekend", icon: "▦" },
    { id: "dodaj", label: "Dodaj", icon: "+" },
    { id: "historia", label: "Mecze", icon: "≣" },
    { id: "szczegoly", label: "Szczegoly", icon: "◎" },
    { id: "sklady", label: "Sklady", icon: "◫" }
  ];

  return (
    <div className="app-shell mobile-app-shell">
      <header className="mobile-hero">
        <div className="mobile-topbar">
          <div>
            <p className="eyebrow">Current Weekend League</p>
            <h1>FutStat</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => setActiveTab("dodaj")}>
            +
          </button>
        </div>

        <section className="weekend-card">
          <div className="weekend-card-head">
            <div>
              <p className="panel-kicker">Aktualny bilans</p>
              <h2>
                {stats.wins}-{stats.losses}
              </h2>
              <p className="panel-subtle">{stats.draws > 0 ? `${stats.draws} remis(y)` : "Weekend w toku"}</p>
            </div>
            <div className="hero-card compact-card">
              <span className="hero-label">Sugestia</span>
              <strong>{stats.recommendation}</strong>
            </div>
          </div>

          <div className="hero-metric-row">
            <article className="hero-metric">
              <span className="stat-label">Mecze</span>
              <strong>{stats.total}</strong>
            </article>
            <article className="hero-metric">
              <span className="stat-label">Bramki</span>
              <strong>
                {matches.reduce((sum, match) => sum + match.goalsFor, 0)}-
                {matches.reduce((sum, match) => sum + match.goalsAgainst, 0)}
              </strong>
            </article>
            <article className="hero-metric">
              <span className="stat-label">Top scorer</span>
              <strong>{stats.topScorer}</strong>
            </article>
          </div>

          {selectedSquadAnalytics ? (
            <div className="squad-analytics-strip">
              <article className="hero-metric">
                <span className="stat-label">Aktywny sklad</span>
                <strong>{selectedSquadAnalytics.squad.name}</strong>
              </article>
              <article className="hero-metric">
                <span className="stat-label">Lider goli</span>
                <strong>
                  {selectedSquadAnalytics.players[0]
                    ? `${selectedSquadAnalytics.players[0].name} (${selectedSquadAnalytics.players[0].goals})`
                    : "Brak danych"}
                </strong>
              </article>
              <article className="hero-metric">
                <span className="stat-label">Lider asyst</span>
                <strong>
                  {[...selectedSquadAnalytics.players]
                    .sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name))[0]
                    ? `${[...selectedSquadAnalytics.players].sort(
                        (a, b) => b.assists - a.assists || a.name.localeCompare(b.name)
                      )[0].name} (${
                        [...selectedSquadAnalytics.players].sort(
                          (a, b) => b.assists - a.assists || a.name.localeCompare(b.name)
                        )[0].assists
                      })`
                    : "Brak danych"}
                </strong>
              </article>
            </div>
          ) : null}
        </section>

        <nav className="top-tabs">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`top-tab ${activeTab === item.id ? "top-tab-active" : ""}`}
              type="button"
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mobile-main">
        <section className={`mobile-panel ${activeTab === "przeglad" ? "tab-visible" : "tab-hidden"}`}>
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Przeglad</p>
              <h2>Weekend w liczbach</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActiveTab("dodaj")}>
              Dodaj mecz
            </button>
          </div>

          <section className="stats-grid mobile-stats-grid">
            <article className="panel stat-card">
              <span className="stat-label">Seria</span>
              <strong>{stats.currentStreak.label}</strong>
              <span className="stat-meta">{stats.winRate}% wygranych</span>
            </article>

            <article className="panel stat-card">
              <span className="stat-label">Najlepsza godzina</span>
              <strong>{stats.bestHour}</strong>
              <span className="stat-meta">Kiedy grasz najlepiej</span>
            </article>

            <article className="panel stat-card">
              <span className="stat-label">Najtrudniejszy styl</span>
              <strong>{stats.worstMatchup}</strong>
              <span className="stat-meta">Aktualnie najgorszy matchup</span>
            </article>

            <article className="panel stat-card">
              <span className="stat-label">Srednia ocena</span>
              <strong>{stats.averagePlayerRating || "-"}</strong>
              <span className="stat-meta">Ze wszystkich kart meczowych</span>
            </article>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Ostatnie mecze</p>
                <h2>Szybki podglad</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setActiveTab("historia")}>
                Zobacz wszystkie
              </button>
            </div>

            {matches.length === 0 ? (
              <div className="empty-state">
                <strong>Weekend jeszcze pusty.</strong>
                <p>Dodaj pierwszy mecz i zacznij budowac swoje statystyki FUT Champions.</p>
              </div>
            ) : (
              <div className="match-list compact-list">
                {matches.slice(0, 4).map((match) => (
                  <article key={match.id} className="match-card">
                    <div>
                      <span
                        className={`result-pill ${
                          match.result === "win"
                            ? "result-win"
                            : match.result === "loss"
                              ? "result-loss"
                              : "result-draw"
                        }`}
                      >
                        {formatResult(match.result)}
                      </span>
                      <strong>
                        {match.goalsFor}:{match.goalsAgainst}
                      </strong>
                    </div>

                    <div className="match-meta">
                      <span>{match.squadName}</span>
                      <span>{match.squadFormation}</span>
                      <span>{new Date(match.playedAt).toLocaleString("pl-PL")}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <section className={`mobile-panel ${activeTab === "dodaj" ? "tab-visible" : "tab-hidden"}`}>
          <section className="panel form-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Dodaj mecz</p>
              <h2>Pelny zapis spotkania</h2>
            </div>
            <p className="panel-subtle">Formularz oparty o ekrany po meczu w FC.</p>
          </div>

          <div className="form-grid">
            <label>
              Czas meczu
              <input
                type="datetime-local"
                value={form.playedAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, playedAt: event.target.value }))
                }
              />
            </label>

            <label>
              Gole przeciwnika
              <input
                type="number"
                min="0"
                value={form.goalsAgainst}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalsAgainst: event.target.value
                  }))
                }
              />
            </label>

            <label>
              Nazwa skladu
              <input
                type="text"
                value={form.squadName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    squadName: event.target.value
                  }))
                }
              />
            </label>

            <label>
              Formacja skladu
              <input
                type="text"
                value={form.squadFormation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    squadFormation: event.target.value
                  }))
                }
              />
            </label>

            <label className="full-width">
              Wybierz zapisany sklad
              <select
                value={form.squadId}
                onChange={(event) => {
                  const squad = squads.find((entry) => entry.id === event.target.value);
                  setForm((current) => ({
                    ...current,
                    squadId: event.target.value,
                    squadName: squad?.name ?? current.squadName,
                    squadFormation: squad?.formation ?? current.squadFormation
                  }));
                }}
              >
                <option value="">Brak wybranego skladu</option>
                {squads.map((squad) => (
                  <option key={squad.id} value={squad.id}>
                    {squad.name} | {squad.formation} | {squad.players.length} zawodnikow
                  </option>
                ))}
              </select>
            </label>

            <div className="button-row full-width">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  const squad = squads.find((entry) => entry.id === form.squadId);
                  if (squad) {
                    applySquadToMatch(squad);
                  }
                }}
                disabled={!form.squadId}
              >
                Wczytaj sklad do meczu
              </button>
              <button className="ghost-button" type="button" onClick={() => setActiveTab("sklady")}>
                Zarzadzaj skladami
              </button>
            </div>

            <div className="full-width score-preview-card">
              <div>
                <span className="stat-label">Wynik z zawodnikow</span>
                <strong>
                  {computedGoalsFor}:{parseNumber(form.goalsAgainst)}
                </strong>
              </div>
              <div>
                <span className="stat-label">Rezultat</span>
                <strong>{formatResult(computedResult)}</strong>
              </div>
            </div>
          </div>

          <div className="stacked-sections">
            <details className="accordion" open>
              <summary>Sklad i statystyki zawodnikow</summary>
              <section className="subpanel">
                <div className="subpanel-header">
                  <div>
                    <p className="panel-kicker">Sklad meczowy</p>
                    <h3>Zawodnicy i ich statystyki</h3>
                  </div>
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={copySquadFromLastMatch}>
                      Kopiuj ostatni sklad
                    </button>
                  </div>
                </div>

                <div className="squad-header-card">
                  <div>
                    <span className="stat-label">Sklad</span>
                    <strong>{form.squadName || "Moj sklad WL"}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Formacja</span>
                    <strong>{form.squadFormation || "4-2-3-1"}</strong>
                  </div>
                  <div>
                    <span className="stat-label">Zawodnicy</span>
                    <strong>{players.length}</strong>
                  </div>
                </div>

                <div className="quick-player-table">
                  <div className="quick-player-header">
                    <span>Zawodnik</span>
                    <span>Ocena</span>
                    <span>G</span>
                    <span>A</span>
                  </div>

                  {players.length > 0 ? (
                    players.map((player) => (
                      <div key={player.id} className="quick-player-row">
                        <div className="quick-player-name">
                          <strong>{player.name}</strong>
                          <small>{player.position}</small>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          value={player.rating}
                          onChange={(event) =>
                            setPlayers((current) =>
                              current.map((entry) =>
                                entry.id === player.id
                                  ? { ...entry, rating: parseNumber(event.target.value) }
                                  : entry
                              )
                            )
                          }
                        />
                        <input
                          type="number"
                          min="0"
                          value={player.stats.goals}
                          onChange={(event) =>
                            setPlayers((current) =>
                              current.map((entry) =>
                                entry.id === player.id
                                  ? {
                                      ...entry,
                                      stats: {
                                        ...entry.stats,
                                        goals: parseNumber(event.target.value)
                                      }
                                    }
                                  : entry
                              )
                            )
                          }
                        />
                        <input
                          type="number"
                          min="0"
                          value={player.stats.assists}
                          onChange={(event) =>
                            setPlayers((current) =>
                              current.map((entry) =>
                                entry.id === player.id
                                  ? {
                                      ...entry,
                                      stats: {
                                        ...entry.stats,
                                        assists: parseNumber(event.target.value)
                                      }
                                    }
                                  : entry
                              )
                            )
                          }
                        />
                      </div>
                    ))
                  ) : (
                    <div className="empty-state compact">
                      <strong>Wczytaj sklad do meczu.</strong>
                      <p>Po wyborze skladu zobaczysz tu szybka liste zawodnikow do rozliczenia meczu.</p>
                    </div>
                  )}
                </div>
              </section>
            </details>

            <details className="accordion" open>
              <summary>Statystyki mojej druzyny</summary>
              <div className="stats-entry-grid single-stat-grid">
                <section className="subpanel">
              <div className="subpanel-header">
                <div>
                  <p className="panel-kicker">Moja druzyna</p>
                  <h3>Statystyki meczu</h3>
                </div>
                <span className="panel-subtle">Z ekranu podsumowania</span>
              </div>

              <div className="mini-form-grid">
                {teamStatFields.map((field) => (
                  <label key={`team-${field.key}`}>
                    {field.label}
                    <input
                      type="number"
                      step={field.step ?? "1"}
                      value={form.teamStats[field.key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          teamStats: {
                            ...current.teamStats,
                            [field.key]: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
              </div>
            </details>

            <details className="accordion" open>
              <summary>OCR i screeny</summary>
              <section className="subpanel">
            <div className="subpanel-header">
              <div>
                <p className="panel-kicker">Upload</p>
                <h3>Screeny po meczu</h3>
              </div>
              <span className="panel-subtle">Fundament pod OCR w kolejnym kroku.</span>
            </div>

            <div className="side-selector">
              <span>Moja druzyna na screenie jest:</span>
              <div className="segmented-control">
                <button
                  className={`segmented-button ${myTeamSide === "left" ? "segmented-active" : ""}`}
                  type="button"
                  onClick={() => setMyTeamSide("left")}
                >
                  Po lewej
                </button>
                <button
                  className={`segmented-button ${myTeamSide === "right" ? "segmented-active" : ""}`}
                  type="button"
                  onClick={() => setMyTeamSide("right")}
                >
                  Po prawej
                </button>
              </div>
            </div>

            {ocrApplyMessage ? <div className="ocr-success">{ocrApplyMessage}</div> : null}

            <div className="upload-grid">
              <label className="upload-box">
                <span>Podsumowanie meczu</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleScreenshotUpload(event, "summary")}
                />
                <small>Dodaj zdjecie z ekranu statystyk meczu.</small>
              </label>

              <label className="upload-box">
                <span>Analiza wystepu</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleScreenshotUpload(event, "players")}
                />
                <small>Dodaj zdjecie z ekranu zawodnikow twojej druzyny.</small>
              </label>
            </div>

            <div className="upload-preview-grid">
              <div className="upload-preview-card">
                <strong>Podglad podsumowania</strong>
                {summaryScreenshot ? (
                  <>
                    <img
                      className="upload-preview-image"
                      src={summaryScreenshot.dataUrl}
                      alt="Podglad podsumowania meczu"
                    />
                    <span className="panel-subtle">{summaryScreenshot.name}</span>
                    <CropInputs
                      title="Kadr wyniku"
                      value={summaryScoreCrop}
                      onChange={setSummaryScoreCrop}
                    />
                    <CropInputs
                      title="Kadr statystyk"
                      value={summaryStatsCrop}
                      onChange={setSummaryStatsCrop}
                    />
                  </>
                ) : (
                  <span className="panel-subtle">Brak zalaczonego pliku.</span>
                )}
                <div className="button-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void runSummaryOcr()}
                    disabled={!summaryScreenshot || summaryOcr.status === "running"}
                  >
                    {summaryOcr.status === "running" ? "Odczytywanie..." : "Odczytaj OCR"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={applySummaryOcr}
                    disabled={summaryOcr.status !== "done" || !summaryOcr.result}
                  >
                    Wstaw do formularza
                  </button>
                </div>
                {summaryOcr.error ? (
                  <span className="ocr-error">{summaryOcr.error}</span>
                ) : null}
                {summaryOcr.result ? (
                  <div className="ocr-result-box">
                    <strong>
                      {summaryOcr.result.score
                        ? `Wykryty wynik: ${summaryOcr.result.score.left}:${summaryOcr.result.score.right}`
                        : "Nie wykryto wyniku"}
                    </strong>
                    {summaryOcr.result.teams ? (
                      <span className="panel-subtle">
                        Wykryte druzyny: {summaryOcr.result.teams.left} | {summaryOcr.result.teams.right}
                      </span>
                    ) : null}
                    <pre>{summaryOcr.result.rawText}</pre>
                  </div>
                ) : null}
              </div>

              <div className="upload-preview-card">
                <strong>Podglad analizy wystepu</strong>
                {playersScreenshot ? (
                  <>
                    <img
                      className="upload-preview-image"
                      src={playersScreenshot.dataUrl}
                      alt="Podglad analizy wystepu"
                    />
                    <span className="panel-subtle">{playersScreenshot.name}</span>
                    <CropInputs
                      title="Kadr listy zawodnikow"
                      value={playersCrop}
                      onChange={setPlayersCrop}
                    />
                  </>
                ) : (
                  <span className="panel-subtle">Brak zalaczonego pliku.</span>
                )}
                <div className="button-row">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void runPlayersOcr()}
                    disabled={!playersScreenshot || playersOcr.status === "running"}
                  >
                    {playersOcr.status === "running" ? "Odczytywanie..." : "Odczytaj OCR"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={applyPlayersOcr}
                    disabled={playersOcr.status !== "done" || !playersOcr.result?.length}
                  >
                    Dodaj wykrytych zawodnikow
                  </button>
                </div>
                {playersOcr.error ? <span className="ocr-error">{playersOcr.error}</span> : null}
                {playersOcr.result ? (
                  <div className="ocr-result-box">
                    <strong>Wykryci zawodnicy: {playersOcr.result.length}</strong>
                    {playersOcr.result.length > 0 ? (
                      <div className="ocr-player-list">
                        {playersOcr.result.map((player) => (
                          <span key={`${player.name}-${player.rating}`}>
                            {player.name} | {player.rating} | {player.goals} G | {player.assists} A
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="panel-subtle">
                        OCR odczytal tekst, ale nie zlozyl jeszcze sensownych wierszy zawodnikow.
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
              </section>
            </details>

            <label className="full-width">
            Notatki
            <textarea
              rows={3}
              value={form.notes}
              placeholder="Np. dogrywka, karne, czerwona kartka, lag, uwaga taktyczna..."
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>

          </div>

          <button className="primary-button save-match-button" type="button" onClick={addMatch}>
            Zapisz pelny mecz
          </button>
          </section>
        </section>

        <section className={`mobile-panel ${activeTab === "szczegoly" ? "tab-visible" : "tab-hidden"}`}>
          <section className="panel details-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Szczegoly meczu</p>
              <h2>Pelny podglad</h2>
            </div>
            <p className="panel-subtle">
              {selectedMatch
                ? "Podejrzyj zapisane statystyki i zalaczone screeny."
                : "Zapisz mecz, aby odblokowac widok szczegolow."}
            </p>
          </div>

          {!selectedMatch ? (
            <div className="empty-state">
              <strong>Brak szczegolowego meczu.</strong>
              <p>Po zapisaniu spotkania zobaczysz tutaj wszystkie liczby i podglady screenow.</p>
            </div>
          ) : (
            <div className="details-grid">
              <article className="detail-summary">
                <div className="detail-headline">
                  <span
                    className={`result-pill ${
                      selectedMatch.result === "win"
                        ? "result-win"
                        : selectedMatch.result === "loss"
                          ? "result-loss"
                          : "result-draw"
                    }`}
                  >
                    {formatResult(selectedMatch.result)}
                  </span>
                  <strong>
                    {selectedMatch.goalsFor}:{selectedMatch.goalsAgainst}
                  </strong>
                </div>
                <div className="match-meta">
                  <span>{selectedMatch.squadName}</span>
                  <span>{selectedMatch.squadFormation}</span>
                  <span>Stracone gole: {selectedMatch.goalsAgainst}</span>
                  <span>{new Date(selectedMatch.playedAt).toLocaleString("pl-PL")}</span>
                </div>
                {selectedMatch.notes ? (
                  <p className="match-notes">{selectedMatch.notes}</p>
                ) : null}
              </article>

              <div className="upload-preview-grid">
                <div className="upload-preview-card">
                  <strong>Screen podsumowania</strong>
                  {selectedMatch.summaryScreenshot ? (
                    <>
                      <img
                        className="upload-preview-image"
                        src={selectedMatch.summaryScreenshot.dataUrl}
                        alt="Zapisany screen podsumowania meczu"
                      />
                      <span className="panel-subtle">{selectedMatch.summaryScreenshot.name}</span>
                    </>
                  ) : (
                    <span className="panel-subtle">Brak zapisanego screena.</span>
                  )}
                </div>

                <div className="upload-preview-card">
                  <strong>Screen analizy wystepu</strong>
                  {selectedMatch.playersScreenshot ? (
                    <>
                      <img
                        className="upload-preview-image"
                        src={selectedMatch.playersScreenshot.dataUrl}
                        alt="Zapisany screen analizy wystepu"
                      />
                      <span className="panel-subtle">{selectedMatch.playersScreenshot.name}</span>
                    </>
                  ) : (
                    <span className="panel-subtle">Brak zapisanego screena.</span>
                  )}
                </div>
              </div>

              <div className="comparison-grid single-stat-grid">
                <section className="subpanel">
                  <div className="subpanel-header">
                    <div>
                      <p className="panel-kicker">Moja druzyna</p>
                      <h3>Zapisane statystyki</h3>
                    </div>
                  </div>
                  <div className="stat-list">
                    {teamStatFields.map((field) => (
                      <div key={`team-view-${field.key}`} className="stat-row">
                        <span>{field.label}</span>
                        <strong>{selectedMatch.teamStats[field.key]}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="subpanel">
                <div className="subpanel-header">
                  <div>
                    <p className="panel-kicker">Karty zawodnikow</p>
                    <h3>{selectedMatch.playerEntries.length} zapisanych zawodnikow</h3>
                  </div>
                </div>

                {selectedMatch.playerEntries.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>Brak zawodnikow w tym meczu.</strong>
                    <p>Mecz jest zapisany, ale tym razem pominieto rozpiske skladu.</p>
                  </div>
                ) : (
                  <div className="player-table">
                    <div className="player-table-header">
                      <span>Zawodnik</span>
                      <span>Ocena</span>
                      <span>Bramki</span>
                      <span>Asysty</span>
                      <span>Podania</span>
                      <span>Dystans</span>
                    </div>
                    {selectedMatch.playerEntries.map((player) => (
                      <div key={player.id} className="player-table-row">
                        <span>
                          {player.name} <small>{player.position}</small>
                        </span>
                        <span>{player.rating.toFixed(1)}</span>
                        <span>{player.stats.goals}</span>
                        <span>{player.stats.assists}</span>
                        <span>{player.stats.passes}</span>
                        <span>{player.stats.distanceKm} km</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
          </section>
        </section>

        <section className={`mobile-panel ${activeTab === "historia" ? "tab-visible" : "tab-hidden"}`}>
          <section className="panel history-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Archiwum</p>
              <h2>Historia meczow</h2>
            </div>
            <p className="panel-subtle">{matches.length} zapisanych</p>
          </div>

          {matches.length === 0 ? (
            <div className="empty-state">
              <strong>Nie ma jeszcze zadnych meczow.</strong>
              <p>Dodaj pierwsze spotkanie, a dashboard od razu zacznie budowac twoje wzorce gry.</p>
            </div>
          ) : (
            <div className="match-list">
              {matches.map((match) => (
                <article
                  key={match.id}
                  className={`match-card ${selectedMatch?.id === match.id ? "match-card-active" : ""}`}
                >
                  <div>
                    <span
                      className={`result-pill ${
                        match.result === "win"
                          ? "result-win"
                          : match.result === "loss"
                            ? "result-loss"
                            : "result-draw"
                      }`}
                    >
                      {formatResult(match.result)}
                    </span>
                    <strong>
                      {match.goalsFor}:{match.goalsAgainst}
                    </strong>
                  </div>

                  <div className="match-meta">
                    <span>{match.squadName}</span>
                    <span>{match.squadFormation}</span>
                    <span>Stracone: {match.goalsAgainst}</span>
                    <span>{match.playerEntries.length} zawodnikow</span>
                    <span>{new Date(match.playedAt).toLocaleString("pl-PL")}</span>
                  </div>

                  {match.notes ? <p className="match-notes">{match.notes}</p> : null}

                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setSelectedMatchId(match.id);
                        setActiveTab("szczegoly");
                      }}
                    >
                      Zobacz szczegoly
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => removeMatch(match.id)}
                    >
                      Usun
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          </section>
        </section>

        <section className={`mobile-panel ${activeTab === "sklady" ? "tab-visible" : "tab-hidden"}`}>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Sklady</p>
                <h2>Baza twoich skladow</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setActiveTab("dodaj")}>
                Wroc do meczu
              </button>
            </div>

            <div className="stacked-sections">
              <section className="subpanel">
                <div className="subpanel-header">
                  <div>
                    <p className="panel-kicker">Nowy sklad</p>
                    <h3>
                      {editingSquadId ? "Edytuj zapisany sklad" : "Zbuduj sklad niezaleznie od meczu"}
                    </h3>
                  </div>
                  {editingSquadId ? (
                    <span className="panel-subtle">Tryb edycji aktywny</span>
                  ) : null}
                </div>

                <div className="form-grid">
                  <label>
                    Nazwa skladu
                    <input
                      type="text"
                      value={squadForm.name}
                      onChange={(event) =>
                        setSquadForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Formacja
                    <input
                      type="text"
                      value={squadForm.formation}
                      onChange={(event) =>
                        setSquadForm((current) => ({
                          ...current,
                          formation: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="player-form-grid">
                  <label>
                    Nazwa zawodnika
                    <input
                      type="text"
                      value={squadPlayerForm.name}
                      onChange={(event) =>
                        setSquadPlayerForm((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                    />
                  </label>

                  <label>
                    Pozycja
                    <input
                      type="text"
                      value={squadPlayerForm.position}
                      onChange={(event) =>
                        setSquadPlayerForm((current) => ({
                          ...current,
                          position: event.target.value
                        }))
                      }
                    />
                  </label>

                  <label>
                    Ocena
                    <input
                      type="number"
                      value={squadPlayerForm.rating}
                      onChange={(event) =>
                        setSquadPlayerForm((current) => ({
                          ...current,
                          rating: event.target.value
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button className="ghost-button" type="button" onClick={addSquadPlayerToDraft}>
                    Dodaj do skladu
                  </button>
                  <button className="primary-button" type="button" onClick={saveSquad}>
                    {editingSquadId ? "Zapisz zmiany" : "Zapisz sklad"}
                  </button>
                  {editingSquadId ? (
                    <button className="ghost-button" type="button" onClick={cancelSquadEditing}>
                      Anuluj edycje
                    </button>
                  ) : null}
                </div>

                {squadPlayersDraft.length > 0 ? (
                  <div className="player-chip-grid">
                    {squadPlayersDraft.map((player) => (
                      <article key={player.id} className="player-chip">
                        <div>
                          <strong>{player.name}</strong>
                          <span>
                            {player.position} | {player.rating}
                          </span>
                        </div>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => removeSquadDraftPlayer(player.id)}
                        >
                          Usun
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <strong>Brak zawodnikow w roboczym skladzie.</strong>
                    <p>Dodaj zawodnikow, zapisz sklad i potem wybierz go przy meczu.</p>
                  </div>
                )}
              </section>

              <section className="subpanel">
                <div className="subpanel-header">
                  <div>
                    <p className="panel-kicker">Zapisane sklady</p>
                    <h3>{squads.length} gotowych skladow</h3>
                  </div>
                </div>

                {squads.length === 0 ? (
                  <div className="empty-state compact">
                    <strong>Nie masz jeszcze zadnego skladu.</strong>
                    <p>Stworz pierwszy sklad, a potem wybieraj go przy dodawaniu meczu.</p>
                  </div>
                ) : (
                  <div className="match-list">
                    {squadAnalytics.map(({ squad, players: aggregates }) => (
                      <article key={squad.id} className="match-card">
                        <div>
                          <strong>{squad.name}</strong>
                        </div>
                        <div className="match-meta">
                          <span>{squad.formation}</span>
                          <span>{squad.players.length} zawodnikow</span>
                          <span>{matches.filter((match) => match.squadId === squad.id).length} meczow</span>
                        </div>

                        {aggregates.length > 0 ? (
                          <div className="squad-aggregate-grid">
                            <article className="player-chip">
                              <div>
                                <strong>Top scorer</strong>
                                <span>
                                  {aggregates[0].name} | {aggregates[0].goals} goli
                                </span>
                              </div>
                            </article>
                            <article className="player-chip">
                              <div>
                                <strong>Top assists</strong>
                                <span>
                                  {[...aggregates].sort(
                                    (a, b) => b.assists - a.assists || a.name.localeCompare(b.name)
                                  )[0].name}{" "}
                                  |{" "}
                                  {[...aggregates].sort(
                                    (a, b) => b.assists - a.assists || a.name.localeCompare(b.name)
                                  )[0].assists}{" "}
                                  asyst
                                </span>
                              </div>
                            </article>
                            <article className="player-chip">
                              <div>
                                <strong>Najlepsza srednia</strong>
                                <span>
                                  {[...aggregates].sort(
                                    (a, b) =>
                                      b.averageMatchRating - a.averageMatchRating ||
                                      a.name.localeCompare(b.name)
                                  )[0].name}{" "}
                                  |{" "}
                                  {[...aggregates].sort(
                                    (a, b) =>
                                      b.averageMatchRating - a.averageMatchRating ||
                                      a.name.localeCompare(b.name)
                                  )[0].averageMatchRating}
                                </span>
                              </div>
                            </article>
                          </div>
                        ) : null}

                        <div className="player-table squad-table">
                          <div className="player-table-header">
                            <span>Zawodnik</span>
                            <span>Wystepy</span>
                            <span>Bramki</span>
                            <span>Asysty</span>
                            <span>Srednia</span>
                            <span>Ocena bazowa</span>
                          </div>
                          {aggregates.map((player) => (
                            <div key={`${squad.id}-${player.name}`} className="player-table-row">
                              <span>
                                {player.name} <small>{player.position}</small>
                              </span>
                              <span>{player.matches}</span>
                              <span>{player.goals}</span>
                              <span>{player.assists}</span>
                              <span>{player.averageMatchRating}</span>
                              <span>{player.rating}</span>
                            </div>
                          ))}
                        </div>

                        <div className="button-row">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => startEditingSquad(squad)}
                          >
                            Edytuj sklad
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => {
                              applySquadToMatch(squad);
                              setActiveTab("dodaj");
                            }}
                          >
                            Uzyj w meczu
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => deleteSquad(squad.id)}
                          >
                            Usun sklad
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        </section>
      </main>

      <nav className="bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`bottom-nav-item ${activeTab === item.id ? "bottom-nav-item-active" : ""}`}
            type="button"
            onClick={() => setActiveTab(item.id)}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
