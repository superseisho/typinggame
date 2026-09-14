import { ROOMS_BY_TYPE } from '../../data/rooms/roomDefinitions';
import type { RoomOption } from '../../types/dungeon';
import { RoomCard } from './RoomCard';

export function RoomSelection({ options, onChoose, preBoss = false }: { readonly options: readonly RoomOption[]; readonly onChoose: (id: string) => void; readonly preBoss?: boolean }) {
  return <section className="dungeon-room room-selection" aria-label="部屋選択">
    <div className="dungeon-heading"><span className="eyebrow">{preBoss ? 'BOSS AHEAD' : 'THE DESCENT'}</span><h1>{preBoss ? 'Prepare for the Boss' : 'Choose Your Path'}</h1><p>{preBoss ? '次はBoss戦。PartyのHPとGoldを見て、最後の準備を選びましょう。' : '進む道を1つ選択。HPとGoldは次の階へ引き継がれます。'}</p></div>
    <div className={`room-grid${preBoss ? ' room-grid--pre-boss' : ''}`}>{options.map(option =>
      <RoomCard key={option.id} room={ROOMS_BY_TYPE[option.type]} onSelect={() => onChoose(option.id)} />
    )}</div>
  </section>;
}
