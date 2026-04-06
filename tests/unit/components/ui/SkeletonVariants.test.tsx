import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SkeletonScreen } from '@/components/ui/SkeletonScreen'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { SkeletonChatMessage } from '@/components/ui/SkeletonChatMessage'
import { SkeletonSourceItem } from '@/components/ui/SkeletonSourceItem'

describe('Skeleton Components', () => {
  it('renders SkeletonScreen without errors', () => {
    const { container } = render(<SkeletonScreen />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders SkeletonCard without errors', () => {
    const { container } = render(<SkeletonCard />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders SkeletonChatMessage without errors', () => {
    const { container } = render(<SkeletonChatMessage isUser={true} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders SkeletonSourceItem without errors', () => {
    const { container } = render(<SkeletonSourceItem />)
    expect(container.firstChild).toBeInTheDocument()
  })
})
