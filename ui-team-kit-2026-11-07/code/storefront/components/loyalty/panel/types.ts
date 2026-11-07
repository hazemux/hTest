import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import type {
  BalanceHistoryRow,
  EarnRule,
  LoyaltyNotification,
  LoyaltyProgram,
  LoyaltyViewer,
  LoyaltyWallet,
  PerksState,
  PointsHistoryRow,
  ReferralSummary,
} from "@/lib/loyalty/types";

/** Every screen the rewards panel can show. `home` is the member root, `guest` the guest root. */
export type PanelView = "home" | "guest" | "earn" | "redeem" | "levels" | "referral" | "refList" | "history" | "notifs" | "faq";

/**
 * Where the panel's links go. A link whose destination does not exist is
 * `null`, and its control is NOT drawn (HANDBOOK §5: a control renders only if
 * its destination works).
 */
export type PanelLinks = {
  signUp: string | null;
  signIn: string | null;
  topUp: string | null;
  /** The basket — «استخدمها في السلة». */
  checkout: string | null;
  wallet: string | null;
  /** The public programme page (`/rewards`). */
  rewards: string | null;
  /** Two-step verification, for a perk the API refused with `step_up_required`. */
  verify: string | null;
};

/**
 * The lists the panel loads only when it opens (ADR 0043 §9). `null` = not
 * loaded yet (drawn as «جارٍ التحميل», never as empty); `[]` = really empty.
 * A list that could not be read is named in `failedLists` instead, and its
 * view says so rather than drawing nothing.
 */
export type PanelLists = {
  pointsHistory: PointsHistoryRow[] | null;
  balanceHistory: BalanceHistoryRow[] | null;
  notifications: LoyaltyNotification[] | null;
  referrals: ReferralSummary | null;
  /** This customer's challenge board; the programme's rules stand in until it loads. */
  challenges: EarnRule[] | null;
  perks: PerksState | null;
};

export type PanelListKey = keyof PanelLists;

/** What redeeming a perk came to — the server's answer, in one word. */
export type PerkOutcome = "redeemed" | "step_up" | "insufficient" | "failed";

export type RewardsPanelProps = {
  locale: Locale;
  viewer: LoyaltyViewer;
  program: LoyaltyProgram;
  /** The render's clock, ISO — one value for the server and the browser. */
  now: string;
  links: PanelLinks;
  lists?: Partial<PanelLists>;
  failedLists?: ReadonlySet<PanelListKey>;
  initialView?: PanelView;
  /** Called when a view that needs a lazy list opens, so the host can fetch it. */
  onNeed?: (view: PanelView) => void;
  /** Redeem a perk. Without it the redeem buttons are not drawn. */
  onRedeemPerk?: (code: string) => Promise<PerkOutcome>;
  onClose: () => void;
  /** `sheet` draws the grab handle and the phone's top-only radius. */
  layout: "dropdown" | "sheet";
};

/** What every view receives. */
export type ViewContext = {
  locale: Locale;
  m: Messages;
  program: LoyaltyProgram;
  now: Date;
  links: PanelLinks;
  lists: PanelLists;
  failed: ReadonlySet<PanelListKey>;
  go: (view: PanelView) => void;
};

export type MemberViewContext = ViewContext & { wallet: LoyaltyWallet };
