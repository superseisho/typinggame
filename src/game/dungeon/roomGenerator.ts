import { ROOM_DEFINITIONS } from '../../data/rooms/roomDefinitions';
import type { RoomDefinition, RoomOption } from '../../types/dungeon';
import { DUNGEON_CONFIG } from './dungeonConfig';

/** Seeded random state makes each transition deterministic, including React retries. */
export function randomStep(seed: number): { seed: number; value: number } {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { seed: next, value: next / 4294967296 };
}

export function generateRoomOptions(seed: number, floor: number, definitions = ROOM_DEFINITIONS) {
  const options: RoomOption[] = [];
  for (let i = 0; i < DUNGEON_CONFIG.roomChoices; i += 1) {
    const available = definitions.filter((room) => room.weight > 0 && options.filter((option) => option.type === room.type).length < DUNGEON_CONFIG.maxSameRoom);
    if (available.length === 0) throw new Error('Room weights must support three choices.');
    const random = randomStep(seed);
    seed = random.seed;
    let remaining = random.value * available.reduce((sum, room) => sum + room.weight, 0);
    let chosen: RoomDefinition = available[available.length - 1];
    for (const room of available) {
      remaining -= room.weight;
      if (remaining < 0) { chosen = room; break; }
    }
    options.push({ id: `${floor}-${i}`, type: chosen.type });
  }
  return { options, seed };
}
