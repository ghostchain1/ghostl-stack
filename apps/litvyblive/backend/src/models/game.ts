export interface GameModelData {
  id: string;
  name: string;
  iconEmoji: string;
  entryFee: number;
  isAvailable: boolean;
  category: string;
}

export const GameModel = {
  catalog: [
    { id: 'lucky_spin', name: 'Lucky Spin', iconEmoji: '🎡', entryFee: 5, isAvailable: true, category: 'casual' },
    { id: 'guess_number', name: 'Guess Number', iconEmoji: '🔢', entryFee: 2, isAvailable: true, category: 'casual' },
    { id: 'dice', name: 'Dice Duel', iconEmoji: '🎲', entryFee: 10, isAvailable: true, category: 'casual' },
    { id: 'treasure_box', name: 'Treasure Box', iconEmoji: '📦', entryFee: 20, isAvailable: true, category: 'casual' },
    { id: 'pk_battle', name: 'PK Battle', iconEmoji: '⚡', entryFee: 50, isAvailable: true, category: 'battle' },
    { id: 'lucky_slots', name: 'Lucky Slots', iconEmoji: '🎰', entryFee: 15, isAvailable: true, category: 'casual' },
  ] as GameModelData[],
};
