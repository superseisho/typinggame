import type { SaveData } from '../../types/save';

export interface SaveRepository {
  load(): Promise<SaveData>;
  save(data: SaveData): Promise<void>;
}
