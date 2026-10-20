import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Remove whatever the previous test rendered, so tests don't see each other's screens.
afterEach(() => cleanup())

// No live Realtime connection in tests (a test can still override this mock).
vi.mock('@/services/realtime', () => ({ subscribeToQueueChanges: vi.fn(() => () => {}) }))
