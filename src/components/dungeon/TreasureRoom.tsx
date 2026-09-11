import { getTreasureTrapPercent } from '../../game/dungeon/treasureConfig';

export function TreasureRoom({ onOpen }: { readonly onOpen: () => void }) {
  return <section className="dungeon-room treasure-room" aria-label="Treasure">
    <span className="eyebrow">FORTUNE FAVORS THE BOLD</span><h1>Treasure</h1>
    <div className="treasure-chest" aria-hidden="true"><span>◆</span></div>
    <p>古びた宝箱が置かれている。Goldは不要。<br />祝福、大量Gold、回復……あるいは敵の罠。</p>
    <p className="trap-risk">Trap Battle {getTreasureTrapPercent()}% · HP / Downを引き継いで戦闘</p>
    <button type="button" className="dungeon-button" onClick={onOpen}>OPEN TREASURE</button>
  </section>;
}
