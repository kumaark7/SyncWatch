const NAME_PREFIXES = [
  "Bright",
  "Calm",
  "Cosmic",
  "Golden",
  "Happy",
  "Nova",
  "Silver",
  "Sunny"
] as const;

const NAMES = [
  "Anu",
  "Arun",
  "Dev",
  "Isha",
  "Kavin",
  "Kiran",
  "Maya",
  "Meera",
  "Nila",
  "Ravi",
  "Tara",
  "Vikram"
] as const;

const ROOM_PREFIXES = [
  "After Hours",
  "Friday",
  "Midnight",
  "Moonlight",
  "Prime Time",
  "Weekend"
] as const;

const ROOM_SUFFIXES = [
  "Cinema",
  "Feature",
  "Movie Night",
  "Premiere",
  "Screening",
  "Watch Party"
] as const;

function pick<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)];
}

export function generateDisplayName() {
  return `${pick(NAME_PREFIXES)} ${pick(NAMES)}`;
}

export function generateRoomName() {
  return `${pick(ROOM_PREFIXES)} ${pick(ROOM_SUFFIXES)}`;
}
