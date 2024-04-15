export class Utils {
  // Generically shuffle arrays in-place using Durstenfeld's shuffling algorithm
  static shuffle<T>(array: T[]): T[] {
    console.log('Original array:', array);
    for (let i = array.length - 1; i >= 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}