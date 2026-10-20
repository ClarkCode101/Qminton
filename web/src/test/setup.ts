import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Remove whatever the previous test rendered, so tests don't see each other's screens.
afterEach(() => cleanup())

// No live Realtime connection in tests. A plain function (not vi.fn) so that
// vi.resetAllMocks() in a test file can't break it; a test can still override it.
vi.mock('@/services/realtime', () => ({ subscribeToQueueChanges: () => () => {} }))
