import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EmptyState } from '@/components/ui/EmptyState'
import { Search } from 'lucide-react'

describe('EmptyState Component', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Test Title" description="Test description" />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<EmptyState title="Test Title" icon={<Search data-testid="search-icon" />} />)
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('renders action button and triggers onClick', () => {
    const handleClick = vi.fn()
    render(
      <EmptyState 
        title="Test Title" 
        action={{ label: "Click Me", onClick: handleClick, icon: <Search /> }} 
      />
    )
    
    const button = screen.getByRole('button', { name: "Click Me" })
    expect(button).toBeInTheDocument()
    
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
