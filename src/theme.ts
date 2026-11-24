import type { ThemeConfig } from 'antd';

export const portalTheme: ThemeConfig = {
  token: {
    // Colors
    colorPrimary: '#7c3aed', // Brand violet/purple
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    colorTextBase: '#0f172a',
    colorBgBase: '#ffffff',
    colorBgLayout: '#f8fafc',
    colorBorder: '#e2e8f0',
    colorBorderSecondary: '#f1f5f9',

    // Typography
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    fontSizeHeading1: 24,
    fontSizeHeading2: 20,
    fontSizeHeading3: 16,
    fontSizeHeading4: 14,

    // Layout & Geometry
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    controlHeight: 36,
    controlHeightLG: 42,
    controlHeightSM: 28,

    // Shadows
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
    boxShadowSecondary: '0 4px 12px 0 rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
  },
  components: {
    Layout: {
      siderBg: '#1e1136',
      headerBg: 'rgba(255, 255, 255, 0.92)',
      headerHeight: 64,
      headerPadding: '0 24px',
      bodyBg: '#f8fafc',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: '#7c3aed',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: '#cbd5e1',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      darkItemHoverColor: '#ffffff',
      itemBorderRadius: 8,
      itemMarginInline: 10,
      itemHeight: 40,
      fontSize: 13,
    },
    Card: {
      borderRadiusLG: 12,
      paddingLG: 20,
    },
    Table: {
      headerBg: '#f8fafc',
      headerColor: '#475569',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f5f3ff',
      borderColor: '#e2e8f0',
      fontSize: 13,
    },
    Button: {
      controlHeight: 36,
      borderRadius: 8,
      fontWeight: 500,
    },
    Input: {
      controlHeight: 36,
      borderRadius: 8,
    },
    Select: {
      controlHeight: 36,
      borderRadius: 8,
    },
    Tag: {
      borderRadiusSM: 6,
      fontSize: 11,
      lineHeight: 1.8,
    },
    Modal: {
      borderRadiusLG: 14,
    },
    Drawer: {
      borderRadiusLG: 14,
    },
  },
};
