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

type MatchEntry = {
  id: string;
  playedAt: string;
  result: Result;
  goalsFor: number;
  goalsAgainst: number;
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
  opponentName: string;
  opponentFormation: string;
  opponentStyle: OpponentStyle;
  teamStats: Record<TeamStatKey, string>;
  opponentStats: Record<TeamStatKey, string>;
  notes: string;
};

type PlayerForm = {
  name: string;
  position: string;
  rating: string;
  stats: Record<PlayerStatKey, string>;
};

const STORAGE_KEY = "futstat.matches";

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

const playerPresets = [
  {
    name: "Forlan",
    position: "ST",
    rating: "7.9",
    stats: {
      goals: "2",
      assists: "0",
      shots: "3",
      shotAccuracy: "66",
      passes: "21",
      passAccuracy: "81",
      dribbles: "6",
      dribbleAccuracy: "50",
      tackles: "0",
      tackleAccuracy: "0",
      offsides: "1",
      fouls: "0",
      possessionWon: "2",
      possessionLost: "8",
      distanceKm: "10.1",
      sprints: "16"
    }
  },
  {
    name: "Raphinha",
    position: "RW",
    rating: "7.1",
    stats: {
      goals: "1",
      assists: "0",
      shots: "2",
      shotAccuracy: "50",
      passes: "18",
      passAccuracy: "77",
      dribbles: "9",
      dribbleAccuracy: "66",
      tackles: "1",
      tackleAccuracy: "100",
      offsides: "0",
      fouls: "1",
      possessionWon: "4",
      possessionLost: "10",
      distanceKm: "9.3",
      sprints: "14"
    }
  },
  {
    name: "Gerrard",
    position: "CM",
    rating: "7.8",
    stats: {
      goals: "0",
      assists: "1",
      shots: "1",
      shotAccuracy: "0",
      passes: "34",
      passAccuracy: "91",
      dribbles: "3",
      dribbleAccuracy: "66",
      tackles: "4",
      tackleAccuracy: "75",
      offsides: "0",
      fouls: "0",
      possessionWon: "7",
      possessionLost: "6",
      distanceKm: "11.2",
      sprints: "11"
    }
  }
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
  goalsAgainst: "2",
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

const defaultPlayerForm = (): PlayerForm => ({
  name: "",
  position: "ST",
  rating: "7.0",
  stats: createDefaultPlayerStats()
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

function App() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [form, setForm] = useState<MatchForm>(defaultForm);
  const [playerForm, setPlayerForm] = useState<PlayerForm>(defaultPlayerForm);
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

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
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
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
  }, [matches]);

  const selectedMatch =
    matches.find((match) => match.id === selectedMatchId) ?? matches[0] ?? null;

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

  const addPlayer = () => {
    if (!playerForm.name.trim()) {
      return;
    }

    const nextPlayer: PlayerEntry = {
      id: crypto.randomUUID(),
      name: playerForm.name.trim(),
      position: playerForm.position.trim() || "UNK",
      rating: parseNumber(playerForm.rating),
      stats: toPlayerStats(playerForm.stats)
    };

    setPlayers((current) =>
      [...current, nextPlayer].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    );
    setPlayerForm(defaultPlayerForm());
  };

  const applyPlayerPreset = () => {
    const preset = playerPresets[players.length % playerPresets.length];
    setPlayerForm({
      name: preset.name,
      position: preset.position,
      rating: preset.rating,
      stats: {
        ...createDefaultPlayerStats(),
        ...preset.stats
      }
    });
  };

  const removePendingPlayer = (id: string) => {
    setPlayers((current) => current.filter((player) => player.id !== id));
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

      if (summaryResult.score) {
        const goalsFor = summaryResult.score.left;
        const goalsAgainst = summaryResult.score.right;
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
        next.teamStats[key as TeamStatKey] = value;
      }

      for (const [key, value] of Object.entries(summaryResult.opponentStats)) {
        next.opponentStats[key as TeamStatKey] = value;
      }

      return next;
    });
  };

  const applyPlayersOcr = () => {
    if (!playersOcr.result || playersOcr.result.length === 0) {
      return;
    }

    const importedPlayers = playersOcr.result.map((player) => ({
      id: crypto.randomUUID(),
      name: player.name,
      position: "UNK",
      rating: parseNumber(player.rating),
      stats: {
        ...toPlayerStats(createDefaultPlayerStats()),
        goals: parseNumber(player.goals),
        assists: parseNumber(player.assists)
      }
    }));

    setPlayers((current) =>
      [...current, ...importedPlayers].sort(
        (a, b) => b.rating - a.rating || a.name.localeCompare(b.name)
      )
    );
  };

  const addMatch = () => {
    const nextMatch: MatchEntry = {
      id: crypto.randomUUID(),
      playedAt: form.playedAt,
      result: form.result,
      goalsFor: parseNumber(form.goalsFor),
      goalsAgainst: parseNumber(form.goalsAgainst),
      opponentName: form.opponentName.trim() || "Przeciwnik FUT Champions",
      opponentFormation: form.opponentFormation.trim(),
      opponentStyle: form.opponentStyle,
      teamStats: toTeamStats(form.teamStats),
      opponentStats: toTeamStats(form.opponentStats),
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

    setForm(defaultForm());
    setPlayers([]);
    setPlayerForm(defaultPlayerForm());
    setSummaryScreenshot(null);
    setPlayersScreenshot(null);
    setSummaryOcr({ status: "idle", result: null, error: null });
    setPlayersOcr({ status: "idle", result: null, error: null });
  };

  const removeMatch = (id: string) => {
    setMatches((current) => current.filter((match) => match.id !== id));
    if (selectedMatchId === id) {
      setSelectedMatchId(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Tracker FUT Champions</p>
          <h1>FutStat</h1>
          <p className="hero-copy">
            Zapisuj pelne statystyki meczu i zawodnikow, dodawaj screeny po spotkaniu
            i buduj archiwum gotowe pod kolejny krok: automatyczne odczytywanie danych.
          </p>
        </div>
        <div className="hero-card">
          <span className="hero-label">Sugestia sesji</span>
          <strong>{stats.recommendation}</strong>
        </div>
      </header>

      <main className="content-grid">
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
              Wynik meczu
              <select
                value={form.result}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    result: event.target.value as Result
                  }))
                }
              >
                <option value="win">Wygrana</option>
                <option value="draw">Remis</option>
                <option value="loss">Porazka</option>
              </select>
            </label>

            <label>
              Gole moje
              <input
                type="number"
                min="0"
                value={form.goalsFor}
                onChange={(event) =>
                  setForm((current) => ({ ...current, goalsFor: event.target.value }))
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
              Nazwa przeciwnika
              <input
                type="text"
                value={form.opponentName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    opponentName: event.target.value
                  }))
                }
              />
            </label>

            <label>
              Formacja przeciwnika
              <input
                type="text"
                value={form.opponentFormation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    opponentFormation: event.target.value
                  }))
                }
              />
            </label>

            <label className="full-width">
              Styl przeciwnika
              <select
                value={form.opponentStyle}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    opponentStyle: event.target.value as OpponentStyle
                  }))
                }
              >
                {opponentStyles.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stats-entry-grid">
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

            <section className="subpanel">
              <div className="subpanel-header">
                <div>
                  <p className="panel-kicker">Przeciwnik</p>
                  <h3>Statystyki meczu</h3>
                </div>
                <span className="panel-subtle">Te same pola po drugiej stronie</span>
              </div>

              <div className="mini-form-grid">
                {teamStatFields.map((field) => (
                  <label key={`opponent-${field.key}`}>
                    {field.label}
                    <input
                      type="number"
                      step={field.step ?? "1"}
                      value={form.opponentStats[field.key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          opponentStats: {
                            ...current.opponentStats,
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

          <section className="subpanel">
            <div className="subpanel-header">
              <div>
                <p className="panel-kicker">Upload</p>
                <h3>Screeny po meczu</h3>
              </div>
              <span className="panel-subtle">Fundament pod OCR w kolejnym kroku.</span>
            </div>

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

          <section className="subpanel">
            <div className="subpanel-header">
              <div>
                <p className="panel-kicker">Moi zawodnicy</p>
                <h3>Statystyki zawodnikow</h3>
              </div>
              <button className="ghost-button" type="button" onClick={applyPlayerPreset}>
                Wczytaj przyklad
              </button>
            </div>

            <div className="player-form-grid">
              <label>
                Nazwa zawodnika
                <input
                  type="text"
                  value={playerForm.name}
                  onChange={(event) =>
                    setPlayerForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>

              <label>
                Pozycja
                <input
                  type="text"
                  value={playerForm.position}
                  onChange={(event) =>
                    setPlayerForm((current) => ({
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
                  step="0.1"
                  value={playerForm.rating}
                  onChange={(event) =>
                    setPlayerForm((current) => ({ ...current, rating: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="mini-form-grid">
              {playerStatFields.map((field) => (
                <label key={`player-${field.key}`}>
                  {field.label}
                  <input
                    type="number"
                    step={field.step ?? "1"}
                    value={playerForm.stats[field.key]}
                    onChange={(event) =>
                      setPlayerForm((current) => ({
                        ...current,
                        stats: {
                          ...current.stats,
                          [field.key]: event.target.value
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="button-row">
              <button className="primary-button" type="button" onClick={addPlayer}>
                Dodaj zawodnika
              </button>
              <span className="panel-subtle">{players.length} zawodnikow gotowych do zapisu</span>
            </div>

            {players.length > 0 ? (
              <div className="player-chip-grid">
                {players.map((player) => (
                  <article key={player.id} className="player-chip">
                    <div>
                      <strong>{player.name}</strong>
                      <span>
                        {player.position} | {player.rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="player-chip-meta">
                      <span>{player.stats.goals} G</span>
                      <span>{player.stats.assists} A</span>
                      <span>{player.stats.passes} P</span>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => removePendingPlayer(player.id)}
                    >
                      Usun
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <strong>Nie dodano jeszcze zawodnikow.</strong>
                <p>Na start wpisuj kluczowych graczy po kazdym meczu, a potem rozszerzymy to na caly sklad.</p>
              </div>
            )}
          </section>

          <button className="primary-button" type="button" onClick={addMatch}>
            Zapisz pelny mecz
          </button>
        </section>

        <section className="stats-grid">
          <article className="panel stat-card">
            <span className="stat-label">Bilans</span>
            <strong>
              {stats.wins}-{stats.draws}-{stats.losses}
            </strong>
            <span className="stat-meta">{stats.winRate}% wygranych</span>
          </article>

          <article className="panel stat-card">
            <span className="stat-label">Aktualna seria</span>
            <strong>{stats.currentStreak.label}</strong>
            <span className="stat-meta">{stats.total} zapisanych meczow</span>
          </article>

          <article className="panel stat-card">
            <span className="stat-label">Najlepsza godzina</span>
            <strong>{stats.bestHour}</strong>
            <span className="stat-meta">Kiedy wyniki sa najmocniejsze</span>
          </article>

          <article className="panel stat-card">
            <span className="stat-label">Najtrudniejszy matchup</span>
            <strong>{stats.worstMatchup}</strong>
            <span className="stat-meta">Styl, ktory aktualnie najbardziej boli</span>
          </article>

          <article className="panel stat-card">
            <span className="stat-label">Srednia ocena</span>
            <strong>{stats.averagePlayerRating || "-"}</strong>
            <span className="stat-meta">Ze wszystkich zapisanych kart zawodnikow</span>
          </article>

          <article className="panel stat-card">
            <span className="stat-label">Najlepszy strzelec</span>
            <strong>{stats.topScorer}</strong>
            <span className="stat-meta">Lider goli do tej pory</span>
          </article>

          <article className="panel stat-card wide">
            <span className="stat-label">Bilans bramkowy</span>
            <strong>{stats.goalDiff >= 0 ? `+${stats.goalDiff}` : stats.goalDiff}</strong>
            <span className="stat-meta">Prosty wskaznik formy weekendowej</span>
          </article>
        </section>

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
                  <span>{selectedMatch.opponentName}</span>
                  <span>{selectedMatch.opponentFormation}</span>
                  <span>{formatOpponentStyle(selectedMatch.opponentStyle)}</span>
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

              <div className="comparison-grid">
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

                <section className="subpanel">
                  <div className="subpanel-header">
                    <div>
                      <p className="panel-kicker">Przeciwnik</p>
                      <h3>Zapisane statystyki</h3>
                    </div>
                  </div>
                  <div className="stat-list">
                    {teamStatFields.map((field) => (
                      <div key={`opponent-view-${field.key}`} className="stat-row">
                        <span>{field.label}</span>
                        <strong>{selectedMatch.opponentStats[field.key]}</strong>
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
                    <span>{match.opponentName}</span>
                    <span>{match.opponentFormation}</span>
                    <span>{formatOpponentStyle(match.opponentStyle)}</span>
                    <span>{match.playerEntries.length} zawodnikow</span>
                    <span>{new Date(match.playedAt).toLocaleString("pl-PL")}</span>
                  </div>

                  {match.notes ? <p className="match-notes">{match.notes}</p> : null}

                  <div className="button-row">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setSelectedMatchId(match.id)}
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
      </main>
    </div>
  );
}

export default App;
