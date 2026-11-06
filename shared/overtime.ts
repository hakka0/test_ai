import {OVERTIME_MS} from './model';
// Normal combat lasts 20 seconds, followed by up to 15 seconds of fever time.
// Multipliers derive from game time so pause, speed and checkpoints agree.
export function overtimeModifiers(start: number | undefined, now: number) {
  const stacks=start===undefined||now<start?0:Math.min(OVERTIME_MS/1000,Math.floor((now-start)/1000)+1);
  return {stacks,power:1.1**stacks,recovery:Math.max(.3,1-stacks*.1),movement:stacks?1.5:1};
}
