import { Fragment } from "./types";


export function reconstructMessage(fragments: Fragment[]): string {
    return [...fragments]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((f) => f.word)
      .join(' ')
  }