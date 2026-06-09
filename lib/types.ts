// ---
// VoteWatch - Core Data Types
// ---

export type Chamber = 'Senate' | 'House' | 'Executive' | 'Governor' | 'Mayor';
export type Party = 'Democrat' | 'Republican' | 'Independent' | string;
export type VoteValue = 'YEA' | 'NAY' | 'ABSTAIN' | 'NOT VOTING';
export type TradeSeverity = 'high' | 'medium' | 'low';
export type LawsuitStatus =
  | 'ONGOING' | 'DISMISSED' | 'SETTLED' | 'CONVICTED'
  | 'ACQUITTED' | 'UNDER REVIEW' | 'RESOLVED' | 'CLOSED' | 'NO SUIT FILED';

// -- Lobby / PAC ---

export interface Lobby {
  id: string;
  name: string;
  shortName: string;
  category: string;
  color: string;
  founded: number;
  mission: string;
  keyPositions: string[];
  annualSpend: number;        // estimated annual lobbying spend in dollars
  budget: string;             // human-readable budget description
}

export interface LobbyContribution {
  lobbyId: string;
  lobbyName: string;
  amount: number;             // career total in dollars
  intent: string;             // what the lobby wants from this politician
  cycle?: string;             // "2024", "2022", "career", etc.
  source?: string;            // "FEC" | "OpenSecrets" | "manual"
}

// -- Stock Trades ---

export interface StockTrade {
  ticker: string;
  company: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  amount: number;             // estimated value in dollars
  amountRange?: string;       // "$1,001 - $15,000" (as disclosed)
  date: string;               // ISO date
  conflict: boolean;
  conflictNote: string;
  source: string;             // "Senate Stock Watcher" | "House Stock Watcher" | "manual"
  filingId?: string;          // original disclosure filing reference
}

// -- Legal Record ---

export interface Lawsuit {
  title: string;
  year: number;
  type: string;               // "Criminal - Federal" | "Civil" | "Ethics" | etc.
  status: LawsuitStatus;
  outcome: string;
  description: string;
  severity: TradeSeverity;
  caseId?: string;            // CourtListener case ID for linking
  courtListenerUrl?: string;
}

// -- Voting Record ---

export interface Vote {
  bill: string;               // bill name / title
  billId?: string;            // Congress.gov bill ID
  date: string;               // ISO date
  vote: VoteValue;
  alignsWithDonors: boolean;  // whether vote aligned with top donor positions
  note: string;
  congressNumber?: number;    // e.g. 117, 118, 119
  rollCallNumber?: number;
}

// -- Transparency Score ---

export interface TransparencyScore {
  total: number;              // 0-100 composite
  lobbyScore: number;         // 0-25  (total lobby money received)
  alignScore: number;         // 0-35  (donor-vote alignment %)
  stockScore: number;         // 0-25  (conflict stock trades)
  legalScore: number;         // 0-15  (lawsuit severity)
  // Derived stats
  totalMoney: number;
  conflictTrades: number;
  donorAlignedVotes: number;
  totalTrackedVotes: number;
  lastUpdated: string;        // ISO datetime of last pipeline run
}

// -- Politician ---

export interface Politician {
  id: string;                 // e.g. "sen-ted-cruz-tx"
  name: string;
  state: string;              // State name or "City, ST" for mayors
  party: Party;
  chamber: Chamber;
  title: string;
  since: number;              // year first took office
  imageUrl?: string;

  // External IDs for live data fetching
  bioguideId?: string;        // Congress.gov unique ID
  fecCandidateId?: string;    // FEC candidate ID (starts with S/H/P)
  openSecretsId?: string;     // OpenSecrets CID

  // Profile data
  lobbyMoney: LobbyContribution[];
  stockTrades: StockTrade[];
  lawsuits: Lawsuit[];
  // Campaign finance profile (FEC totals endpoint, most-recent reporting period).
  // totalRaised = receipts; large = itemized individual; small = unitemized (grassroots);
  // pac = other-committee money; bigMoneyShare = (itemized+pac+party+transfers)/receipts.
  // `available:false` means no FEC committee matched (show "unavailable", never $0).
  funding?: {
    available: boolean;
    periodYear?: string;
    totalRaised: number;
    largeDonorMoney: number;
    smallDonorMoney: number;
    pacMoney: number;
    partyMoney: number;
    transferMoney: number;
    // Super PAC / outside independent expenditures (FEC Schedule E). NOT part of receipts.
    // Omitted/empty when no data found - never fabricated.
    outsideSpending?: {
      spender: string;
      amount: number;
      position: "support" | "oppose";
      source: string;
    }[];
    // Named large / mega individual donors (FEC Schedule A, individuals). Never fabricated.
    topIndividualDonors?: {
      name: string;
      employer?: string;
      amount: number;
    }[];
    bigMoneyShare: number | null;
    smallDonorShare: number | null;
    confidence: "high" | "medium" | "low";
    sources: string[];
  };
  votes: Vote[];
  viewSummary?: string;       // AI-generated or manually written summary

  // Computed
  score: TransparencyScore;

  // Metadata
  profileComplete: boolean;   // false = compact/basic profile only
  dataVersion: string;        // pipeline run version

  // Flags for categories that do not apply (e.g., executives have no stock/vote disclosures)
  notApplicable?: {
    lobbyMoney?: boolean;
    stockTrades?: boolean;
    votes?: boolean;
    lawsuits?: boolean;
  };
}

// -- Pipeline ---

export interface PipelineConfig {
  congressApiKey: string;
  fecApiKey: string;
  courtListenerToken?: string;
  outputPath: string;
  maxRetries: number;
  rateLimitMs: number;        // ms between requests
}

export interface PipelineRun {
  startedAt: string;
  completedAt?: string;
  version: string;
  politiciansProcessed: number;
  errors: string[];
}

// -- API Response Shapes ---

// Congress.gov member
export interface CongressMember {
  bioguideId: string;
  name: string;
  party: string;
  state: string;
  terms: { chamber: string; startYear: number }[];
  imageUrl?: string;
}

// FEC candidate search result
export interface FECCandidate {
  candidate_id: string;
  name: string;
  party: string;
  state: string;
  office: string;
  total_receipts?: number;
}

// Senate/House Stock Watcher trade
export interface StockWatcherTrade {
  politician: string;
  asset_description: string;
  ticker?: string;
  transaction_date: string;
  disclosure_date: string;
  type: string;               // "Purchase" | "Sale" | "Sale (Partial)"
  amount: string;             // "$1,001 - $15,000"
  owner: string;              // "Self" | "Spouse" | "Dependent"
  comment?: string;
}

// CourtListener search result
export interface CourtListenerCase {
  id: number;
  case_name: string;
  date_filed: string;
  court: string;
  nature_of_suit?: string;
  absolute_url: string;
  snippet?: string;
}
