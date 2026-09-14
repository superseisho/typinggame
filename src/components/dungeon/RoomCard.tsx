import type { RoomDefinition } from '../../types/dungeon';

/** One click target, shared by normal paths and the pre-boss preparation pair. */
export function RoomCard({ room, onSelect }: { readonly room: RoomDefinition; readonly onSelect: () => void }) {
  return <button className={`room-card path-card path-card--${room.type}`} type="button" onClick={onSelect} data-room-type={room.type}>
    <span className="room-card__icon" aria-hidden="true">{room.icon}</span>
    <h2>{room.name}</h2>
    <span className="room-card__danger">{room.dangerLevel > 0 ? `Danger ${'★'.repeat(room.dangerLevel)}` : 'SAFE'}</span>
    <p>{room.description}</p>
    <span className="path-card__features">{room.features.map(feature => <span key={feature}>{feature}</span>)}</span>
    <span className="room-card__enter">ENTER <span aria-hidden="true">→</span></span>
  </button>;
}
