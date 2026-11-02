/** Guards asynchronous import completions so only the latest request can commit UI state. */
export class ImportRequestGuard {
  #sequence = 0;

  begin() {
    this.#sequence += 1;
    return this.#sequence;
  }

  isCurrent(token) {
    return Number.isInteger(token) && token === this.#sequence;
  }

  invalidate() {
    this.#sequence += 1;
  }
}
