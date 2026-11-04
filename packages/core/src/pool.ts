// Shuttle havuzu: uydu sitelerden gelen shuttle rezervasyonları aynı hat + aynı zaman diliminde
// tek sefere (run) toplanır. Shuttle havuzu Alanya Group merkezinin ürünüdür; seferi bir
// taşıyıcı araç yapar. Aşırı doluluk yok: koltuk bitince aynı dilimde yeni sefer (yeni araç) açılır.

export interface ShuttleRunBooking {
  readonly bookingId: string;
  readonly passengers: number;
}

export type ShuttleRunStatus = "open" | "assigned" | "completed" | "cancelled";

export interface ShuttleRun {
  readonly id: string;
  readonly routeCode: string;
  /** Dilim başlangıcı, yerel saat "YYYY-MM-DDTHH:mm". */
  readonly slotStart: string;
  readonly capacity: number;
  readonly bookings: readonly ShuttleRunBooking[];
  readonly status: ShuttleRunStatus;
  /** Hak ediş alıcısı: araç tedarikçiye aitse tedarikçi, değilse şoför (agos-governance). */
  readonly carrierPayeeId?: string;
}

export function seatsTaken(run: ShuttleRun): number {
  return run.bookings.reduce((n, b) => n + b.passengers, 0);
}

/** pickupAt'i slotMinutes'lık dilime indirger (ör. 60 dk → 14:35 → 14:00). */
export function slotStartFor(pickupAt: string, slotMinutes: number): string {
  if (!Number.isInteger(slotMinutes) || slotMinutes < 1 || 1440 % slotMinutes !== 0) {
    throw new RangeError("slotMinutes must divide 1440");
  }
  const date = pickupAt.slice(0, 10);
  const minutes = Number(pickupAt.slice(11, 13)) * 60 + Number(pickupAt.slice(14, 16));
  const start = Math.floor(minutes / slotMinutes) * slotMinutes;
  const hh = String(Math.floor(start / 60)).padStart(2, "0");
  const mm = String(start % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}`;
}

export type PoolPlacement =
  | { kind: "existing"; run: ShuttleRun }
  | { kind: "new"; run: ShuttleRun };

/**
 * Rezervasyonu uygun açık sefere yerleştirir ya da yeni sefer önerir. Saf fonksiyon: kalıcılık
 * çağıranın işidir (veritabanında satır kilidi / koşullu güncelleme ile yarış önlenir).
 */
export function placeInPool(
  runs: readonly ShuttleRun[],
  booking: ShuttleRunBooking & { routeCode: string; pickupAt: string },
  opts: { slotMinutes: number; capacity: number; newRunId: () => string },
): PoolPlacement {
  if (booking.passengers > opts.capacity) throw new RangeError("group larger than vehicle capacity");
  const slotStart = slotStartFor(booking.pickupAt, opts.slotMinutes);
  const entry: ShuttleRunBooking = { bookingId: booking.bookingId, passengers: booking.passengers };
  const candidate = runs
    .filter(
      (r) =>
        r.routeCode === booking.routeCode &&
        r.slotStart === slotStart &&
        (r.status === "open" || r.status === "assigned") &&
        seatsTaken(r) + booking.passengers <= r.capacity,
    )
    // En dolu sefer önce: araçları doldur, boş araç açma.
    .sort((a, b) => seatsTaken(b) - seatsTaken(a) || a.id.localeCompare(b.id))[0];
  if (candidate) {
    return { kind: "existing", run: { ...candidate, bookings: [...candidate.bookings, entry] } };
  }
  return {
    kind: "new",
    run: {
      id: opts.newRunId(),
      routeCode: booking.routeCode,
      slotStart,
      capacity: opts.capacity,
      bookings: [entry],
      status: "open",
    },
  };
}
