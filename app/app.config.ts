export default defineAppConfig({
  // The design tokens that code reads in script. The same fixed values live in
  // app/assets/css/tokens.css as --tm-* variables; tests/design-tokens.test.ts fails
  // when the two disagree. Roles (surfaces, text, accent) are not here: they follow
  // the Nuxt UI neutral and accent colours a person picks, through tokens.css.
  tokens: {
    // Status tones. A tone is a background, a text colour and a dot. Each state
    // (on track, overdue, ...) maps to one tone in tokens.css.
    tones: {
      ok: {
        dark: { bg: 'rgba(74, 222, 128, 0.15)', fg: '#86EFAC', dot: '#4ADE80' },
        light: { bg: 'rgba(74, 222, 128, 0.15)', fg: '#166534', dot: '#16A34A' }
      },
      warn: {
        dark: { bg: 'rgba(251, 146, 60, 0.15)', fg: '#FDBA74', dot: '#FB923C' },
        light: { bg: 'rgba(251, 146, 60, 0.15)', fg: '#9A3412', dot: '#EA580C' }
      },
      danger: {
        dark: { bg: 'rgba(248, 113, 113, 0.15)', fg: '#FCA5A5', dot: '#F87171' },
        light: { bg: 'rgba(248, 113, 113, 0.15)', fg: '#991B1B', dot: '#DC2626' }
      },
      info: {
        dark: { bg: 'rgba(96, 165, 250, 0.15)', fg: '#93C5FD', dot: '#60A5FA' },
        light: { bg: 'rgba(96, 165, 250, 0.15)', fg: '#1E40AF', dot: '#2563EB' }
      },
      team: {
        dark: { bg: 'rgba(245, 165, 36, 0.12)', fg: '#FFB938', dot: '#F5A524' },
        light: { bg: 'rgba(217, 119, 6, 0.10)', fg: '#B45309', dot: '#D97706' }
      }
    },
    // The eight states of a card, as the design names them. Each names a tone.
    states: {
      'on-track': 'ok',
      'at-risk': 'warn',
      'off-track': 'danger',
      'overdue': 'danger',
      'due-soon': 'warn',
      'waits-for': 'warn',
      'shared': 'info',
      'team-only': 'team'
    },
    // Keyboard focus ring: amber, 2 px wide, 2 px outside the control.
    focus: { width: 2, offset: 2 }
  },
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'zinc'
    },
    scrollArea: {
      slots: {
        root: 'scrollbar-hidden'
      }
    },
    // App stacking order (see also AiChatWidget):
    //   60 AI chat · 70 floating content
    // Reka portals render with position:fixed and z-index:auto, so without an
    // explicit z-index the chat panel covers their menus and swallows clicks.
    dropdownMenu: {
      slots: {
        content: 'z-70'
      }
    },
    popover: {
      slots: {
        content: 'z-70'
      }
    },
    tooltip: {
      slots: {
        content: 'z-70'
      }
    },
    contextMenu: {
      slots: {
        content: 'z-70'
      }
    },
    commandPalette: {
      slots: {
        content: 'z-70'
      }
    },
    modal: {
      slots: {
        overlay: 'z-70',
        content: 'z-70'
      }
    }
  }
})
