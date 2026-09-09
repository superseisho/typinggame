import { ROOMS_BY_TYPE } from '../../data/rooms/roomDefinitions';
import type { RoomOption } from '../../types/dungeon';

export function RoomSelection({ options, onChoose }: { readonly options: readonly RoomOption[]; readonly onChoose: (id: string) => void }) {
  return <section className="dungeon-room" aria-label="部屋選択">
    <div className="dungeon-heading"><span className="eyebrow">THE DESCENT</span><h1>Choose Your Path</h1><p>進む道を1つ選択。HPとGoldは次の階へ引き継がれます。</p></div>
    <div className="room-grid">{options.map((option) => {
      const room = ROOMS_BY_TYPE[option.type];
      return <button className={`room-card room-card--${room.type}`} type="button" key={option.id} onClick={() => onChoose(option.id)} data-room-type={room.type}>
        <span className="room-card__icon" aria-hidden="true">{room.icon}</span><h2>{room.name}</h2>
        <span className="room-card__danger">{room.dangerLevel > 0 ? `Danger ${'★'.repeat(room.dangerLevel)}` : 'SAFE'}</span>
        <p>{room.description}</p><strong>{room.reward}</strong><span className="room-card__enter">ENTER →</span>
      </button>;
    })}</div>
  </section>;
}
