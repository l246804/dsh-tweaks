/**
 * A recording `MutationObserver` for the reference-highlight tests.
 *
 * The stand-in in `test/helpers/dom.ts` deliberately never fabricates mutation
 * records, so it can prove an observer was created and disconnected but not
 * that a change triggers a re-scan. This one records every instance and its
 * callback, so a test can deliver a change by hand and observe the reaction.
 *
 * @module @leiwang2000/dsh-tweaks/test/features/reference-highlight/recording-observer
 */

/** One recorded observation call. */
interface Observation {
  readonly target: unknown
  readonly options: unknown
}

/** The observer the production code receives, with the evidence a test reads. */
interface RecordingMutationObserver {
  /** Every `observe` call, in order. */
  readonly observations: Observation[]
  /** How many times `disconnect` was called. */
  disconnects: number
  /**
   * Watch a node.
   * @param target - the node.
   * @param options - the observation options.
   */
  observe: (target: unknown, options?: unknown) => void
  /** Stop watching. */
  disconnect: () => void
  /**
   * Whether this observer still watches something.
   * @returns true while an observation is recorded.
   */
  isConnected: () => boolean
  /** Deliver a change, as the page's own observer would. */
  deliver: () => void
}

/** The window a test drives. */
export interface RecordingObservers {
  /** Every observer created so far, in creation order. */
  readonly created: RecordingMutationObserver[]
  /**
   * The most recent observer.
   * @returns the observer created last.
   * @throws {Error} when no observer was created.
   */
  readonly latest: () => RecordingMutationObserver
  /** The constructor to hand the production code. */
  readonly MutationObserver: new (callback: () => void) => RecordingMutationObserver
}

/**
 * Create the recorder.
 * @returns the recorder.
 */
export function createRecordingObservers(): RecordingObservers {
  const created: RecordingMutationObserver[] = []

  class Recorded implements RecordingMutationObserver {
    readonly observations: Observation[] = []
    disconnects = 0

    constructor(private readonly callback: () => void) {
      created.push(this)
    }

    observe(target: unknown, options?: unknown): void {
      this.observations.push({ target, options })
    }

    disconnect(): void {
      this.disconnects += 1
      this.observations.length = 0
    }

    isConnected(): boolean {
      return this.observations.length > 0
    }

    deliver(): void {
      this.callback()
    }
  }

  return {
    created,
    latest: () => {
      const last = created[created.length - 1]
      if (last === undefined)
        throw new Error('recording observers: no observer was created')
      return last
    },
    MutationObserver: Recorded,
  }
}
