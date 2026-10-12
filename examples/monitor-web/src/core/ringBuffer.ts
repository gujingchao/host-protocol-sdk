/** Fixed-capacity FIFO; pushing past capacity overwrites the oldest entry. */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[]
  private start = 0
  private len = 0

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer')
    this.buf = new Array<T | undefined>(capacity)
  }

  get length(): number {
    return this.len
  }

  push(item: T): void {
    const idx = (this.start + this.len) % this.capacity
    this.buf[idx] = item
    if (this.len < this.capacity) this.len++
    else this.start = (this.start + 1) % this.capacity
  }

  /** Oldest → newest. */
  toArray(): T[] {
    const out = new Array<T>(this.len)
    for (let i = 0; i < this.len; i++) out[i] = this.buf[(this.start + i) % this.capacity] as T
    return out
  }

  clear(): void {
    this.buf.fill(undefined)
    this.start = 0
    this.len = 0
  }
}
