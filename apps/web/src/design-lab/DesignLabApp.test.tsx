import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DesignLabApp } from './DesignLabApp';

describe('DesignLabApp', () => {
  it('lists the six initial direction slots', () => {
    render(<DesignLabApp pathname="/design-lab" />);

    expect(screen.getAllByTestId('direction-slot')).toHaveLength(6);
    expect(screen.getByText('Institutional assurance')).toBeInTheDocument();
    expect(screen.getByText('Premium editorial')).toBeInTheDocument();
    expect(screen.getByText('Operations cockpit')).toBeInTheDocument();
    expect(screen.getByText('Guided workflow')).toBeInTheDocument();
    expect(screen.getByText('Document-centric workspace')).toBeInTheDocument();
    expect(screen.getByText('Human-AI review workspace')).toBeInTheDocument();
  });

  it('opens the Institutional Assurance governance register from its public route', () => {
    render(
      <DesignLabApp pathname="/design-lab/institutional-assurance/dashboard" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Assurance register' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Integrated ISO 22000 and IFS Food readiness programme',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Mara Petrescu').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: 'Analysis review' }),
    ).toHaveAttribute(
      'href',
      '/design-lab/institutional-assurance/analysis-review',
    );
  });

  it('preserves the Client Request evidence chain in its public dossier route', () => {
    render(
      <DesignLabApp pathname="/design-lab/institutional-assurance/client-request" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Client Request dossier' }),
    ).toBeInTheDocument();
    expect(screen.getByText('NordVale Foods S.R.L.')).toBeInTheDocument();
    expect(
      screen.getByText('Initial request from Elena Ionescu'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Certification programme brief — revision 2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Discovery call notes')).toBeInTheDocument();
    expect(
      screen.getByText(/Turda is expected to provide warehousing evidence/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Analysis review' }),
    ).toHaveAttribute(
      'href',
      '/design-lab/institutional-assurance/analysis-review',
    );
  });

  it('makes every Extracted Field state and its governance evidence explicit', () => {
    render(
      <DesignLabApp pathname="/design-lab/institutional-assurance/analysis-review" />,
    );

    expect(
      screen.getByRole('heading', { name: 'Analysis decision record' }),
    ).toBeInTheDocument();

    for (const state of ['Confirmed', 'Inferred', 'Missing', 'Contradictory']) {
      expect(screen.getAllByText(state).length).toBeGreaterThan(0);
    }

    expect(screen.getByText('10,000–15,000 tonnes')).toBeInTheDocument();
    expect(screen.getByText('Incompatible source values')).toBeInTheDocument();
    expect(
      screen.getByText(
        'the headcount normally used for external audits is 172',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Originally proposed: 180 people'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Annual tonnage and certification-site scope must be Confirmed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Pricing gate blocked')).toBeInTheDocument();
    expect(
      screen.getByText('AI proposal · not a decision'),
    ).toBeInTheDocument();
  });
});
