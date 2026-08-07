import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignLabApp } from '../../DesignLabApp';

describe('Premium Editorial concept', () => {
  it('presents the canonical request as a navigable dashboard dossier', () => {
    render(<DesignLabApp pathname="/design-lab/premium-editorial/dashboard" />);

    expect(
      screen.getByRole('heading', {
        name: 'Integrated ISO 22000 and IFS Food readiness programme',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Resolve the requested certification scope'),
    ).toBeInTheDocument();

    const chapterNavigation = screen.getByRole('navigation', {
      name: 'Dossier chapters',
    });
    expect(chapterNavigation).toHaveTextContent('Dashboard');
    expect(chapterNavigation).toHaveTextContent('Client Request');
    expect(chapterNavigation).toHaveTextContent('Analysis Review');
    expect(
      screen.getByRole('link', { name: /Client Request/ }),
    ).toHaveAttribute('href', '/design-lab/premium-editorial/client-request');
  });

  it('publishes the complete Client Request and its three source exhibits', () => {
    render(
      <DesignLabApp pathname="/design-lab/premium-editorial/client-request" />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Integrated ISO 22000 and IFS Food readiness programme',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Elena Ionescu')).toHaveLength(2);
    expect(screen.getAllByTestId('premium-editorial-source')).toHaveLength(3);
    expect(
      screen.getByText('Certification programme brief — revision 2'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the current HACCP plan was not included/),
    ).toBeInTheDocument();
    expect(screen.getByText('Internal-audit training')).toBeInTheDocument();
  });

  it('sets all Extracted Fields in an annotated review with textual states', () => {
    render(
      <DesignLabApp pathname="/design-lab/premium-editorial/analysis-review" />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Analysis is a proposal, not a verdict',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('premium-editorial-field')).toHaveLength(6);

    const visibleStates = screen
      .getAllByTestId('premium-editorial-field-status')
      .map((status) => status.textContent);
    expect(visibleStates).toEqual([
      '✓ Confirmed',
      '✓ Confirmed',
      '≈ Inferred',
      '≈ Inferred',
      '— Missing',
      '↯ Contradictory',
    ]);

    expect(screen.getByText('10,000–15,000 tonnes')).toBeInTheDocument();
    expect(screen.getByText('No supported value supplied')).toBeInTheDocument();
    expect(
      screen.getByText('Original proposal: 180 people'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Annual tonnage and certification-site scope must be Confirmed.',
      ),
    ).toBeInTheDocument();

    const firstAnnotation = screen.getAllByText(/Open editorial notes/)[0];
    fireEvent.click(firstAnnotation);
    expect(firstAnnotation.closest('details')).toHaveAttribute('open');
  });
});
