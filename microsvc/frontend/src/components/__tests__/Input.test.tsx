import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Input from '../ui/Input'

describe('Input Component', () => {
  it('renders input element', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('renders with label', () => {
    render(<Input label="Name" />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('renders with error message', () => {
    render(<Input error="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('renders with helper text', () => {
    render(<Input helperText="Enter your full name" />)
    expect(screen.getByText('Enter your full name')).toBeInTheDocument()
  })

  it('does not render helper text when error is present', () => {
    render(<Input error="Error message" helperText="Helper text" />)
    expect(screen.getByText('Error message')).toBeInTheDocument()
    expect(screen.queryByText('Helper text')).not.toBeInTheDocument()
  })

  it('applies error styling when error is present', () => {
    render(<Input error="Error message" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-red-300', 'focus:ring-red-500', 'focus:border-red-500')
  })

  it('applies default styling when no error', () => {
    render(<Input />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-gray-300', 'focus:ring-blue-500', 'focus:border-blue-500')
  })

  it('handles value changes', () => {
    const handleChange = jest.fn()
    render(<Input onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test value' } })
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it('applies custom className', () => {
    render(<Input className="custom-class" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('custom-class')
  })

  it('forwards ref to input element', () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('forwards additional props to input element', () => {
    render(<Input data-testid="test-input" type="email" name="email" />)
    const input = screen.getByTestId('test-input')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('name', 'email')
  })

  it('applies focus styles on focus', () => {
    render(<Input />)
    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    expect(input).toHaveClass('focus:outline-none', 'focus:ring-2')
  })

  it('has correct accessibility attributes with label', () => {
    render(<Input label="Email Address" id="email-input" />)
    const input = screen.getByRole('textbox')
    const label = screen.getByText('Email Address')
    expect(input).toHaveAttribute('id', 'email-input')
    expect(label).toHaveAttribute('for', 'email-input')
  })

  it('displays error message with correct styling', () => {
    render(<Input error="Invalid email format" />)
    const errorMessage = screen.getByText('Invalid email format')
    expect(errorMessage).toHaveClass('text-sm', 'text-red-600')
  })

  it('displays helper text with correct styling', () => {
    render(<Input helperText="We'll never share your email" />)
    const helperText = screen.getByText("We'll never share your email")
    expect(helperText).toHaveClass('text-sm', 'text-gray-500')
  })

  it('handles disabled state', () => {
    render(<Input disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

  it('handles readonly state', () => {
    render(<Input readOnly />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('readonly')
  })
})