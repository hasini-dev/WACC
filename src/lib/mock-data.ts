/**
 * Phase 1 mock data. Every applicant here is fictional. Scores are not typed in;
 * they are computed by `scoreResume` from the structured resumes so the
 * breakdown, reasons and evidence always agree.
 */
import { scoreResume } from "@/lib/match-scoring";
import type {
  Applicant,
  Application,
  EducationEntry,
  ExperienceEntry,
  ExtractionMethod,
  ResumeSkill,
  StructuredResume,
} from "@/types/applicant";
import type { Job, SkillRequirement } from "@/types/job";

export const COMPANY_NAME = "Brightline Payroll";
export const RESUME_DB_SOURCE = "supabase://resumes/brightline";

/** Fixed reference date so server and client compute identical scores. */
export const MOCK_NOW = new Date("2026-10-01T00:00:00Z");

const req = (skill: string, aliases: string[] = [], weight = 1): SkillRequirement => ({ skill, aliases, weight });

export const JOBS: Job[] = [
  {
    id: "job-backend-java",
    title: "Senior Backend Engineer (Java)",
    location: "Atlanta, GA · Hybrid",
    minYears: 5,
    status: "open",
    requirements: {
      must_have: [req("Java"), req("Spring Boot"), req("REST API"), req("SQL"), req("Microservices")],
      nice_to_have: [req("Kafka"), req("Kubernetes"), req("AWS"), req("Docker"), req("Redis")],
      domains: ["payroll", "fintech", "payments", "HR"],
    },
  },
  {
    id: "job-data-people",
    title: "Data Analyst, People Analytics",
    location: "Remote",
    minYears: 2,
    status: "open",
    requirements: {
      must_have: [req("SQL"), req("Python"), req("Tableau"), req("Statistics")],
      nice_to_have: [req("Power BI"), req("Excel"), req("dbt"), req("Snowflake"), req("A/B testing")],
      domains: ["people analytics", "HRIS", "workforce", "HR"],
    },
  },
  {
    id: "job-ux-designer",
    title: "UX/UI Designer",
    location: "New York, NY · On-site",
    minYears: 3,
    status: "open",
    requirements: {
      must_have: [req("Figma"), req("User Research"), req("Prototyping"), req("Design Systems")],
      nice_to_have: [req("HTML"), req("CSS"), req("Accessibility"), req("Usability Testing"), req("Motion")],
      domains: ["SaaS", "enterprise", "HR tech", "B2B"],
    },
  },
];

interface Seed {
  id: string;
  jobId: string;
  fullName: string;
  currentTitle: string;
  location: string;
  email: string;
  phone: string;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  fileName: string;
  extractionMethod?: ExtractionMethod;
  pageCount?: number;
  /** Minutes before page load that the file landed in the resume database. */
  receivedMinutesAgo: number;
}

const x = (title: string, company: string, start: string, end: string | null, bullets: string[]): ExperienceEntry => ({
  title,
  company,
  start,
  end,
  bullets,
});

function fmtMonth(yyyyMm: string | null): string {
  if (!yyyyMm) return "Present";
  const [y, m] = yyyyMm.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1]} ${y}`;
}

/** Render a structured resume back to plain text, the way the extractor would have seen it. */
export function renderResumeText(s: Seed): string {
  const lines = [
    s.fullName,
    `${s.currentTitle} · ${s.location}`,
    `${s.email} · ${s.phone}`,
    "",
    "SUMMARY",
    s.summary,
    "",
    "EXPERIENCE",
    ...s.experience.flatMap((e) => [
      `${e.title} — ${e.company} (${fmtMonth(e.start)} – ${fmtMonth(e.end)})`,
      ...e.bullets.map((b) => `• ${b}`),
      "",
    ]),
    "SKILLS",
    s.skills.join(", "),
    "",
    "EDUCATION",
    ...s.education.map((e) => `${e.degree}, ${e.school}${e.year ? ` (${e.year})` : ""}`),
  ];
  return lines.join("\n");
}

/** Attach the first passage that mentions each skill as its evidence quote. */
function withEvidence(s: Seed): ResumeSkill[] {
  return s.skills.map((name) => {
    const needle = name.toLowerCase();
    const bullet = s.experience.flatMap((e) => e.bullets).find((b) => b.toLowerCase().includes(needle));
    if (bullet) return { name, evidence: bullet, section: "experience" as const };
    if (s.summary.toLowerCase().includes(needle)) return { name, evidence: s.summary, section: "summary" as const };
    return { name, evidence: s.skills.join(", "), section: "skills" as const };
  });
}

const SEEDS: Seed[] = [
  // ── Senior Backend Engineer (Java) ────────────────────────────────────────
  {
    id: "app-marcus-bell",
    jobId: "job-backend-java",
    fullName: "Marcus Bell",
    currentTitle: "Staff Software Engineer",
    location: "Atlanta, GA",
    email: "marcus.bell@example.com",
    phone: "(404) 555-0142",
    summary:
      "Backend engineer with eight years building payroll and payments platforms on Java and Spring Boot. Comfortable owning services end to end, from schema design to on-call.",
    experience: [
      x("Staff Software Engineer", "Ledgerline Payroll", "2021-03", null, [
        "Led migration of a monolithic payroll engine to 14 Java microservices on Kubernetes, cutting pay-run time 62%",
        "Designed REST API contracts used by 40+ internal teams",
        "Introduced Kafka event streams for payments reconciliation across 3 banks",
      ]),
      x("Software Engineer II", "Corvid Payments", "2018-06", "2021-02", [
        "Built Spring Boot services processing 2M card payments per day",
        "Tuned PostgreSQL queries and SQL indexes, reducing p95 latency from 800ms to 120ms",
        "Containerized legacy services with Docker",
      ]),
    ],
    education: [{ degree: "B.S. Computer Science", school: "Georgia State University", year: "2018" }],
    skills: ["Java", "Spring Boot", "REST API", "SQL", "Microservices", "Kafka", "Kubernetes", "Docker", "PostgreSQL"],
    fileName: "marcus_bell_resume.pdf",
    pageCount: 2,
    receivedMinutesAgo: 12,
  },
  {
    id: "app-priya-raman",
    jobId: "job-backend-java",
    fullName: "Priya Raman",
    currentTitle: "Senior Software Engineer",
    location: "Alpharetta, GA",
    email: "priya.r@example.com",
    phone: "(678) 555-0199",
    summary:
      "Senior engineer focused on fintech lending systems. I like boring, well-tested Java services and clear REST contracts.",
    experience: [
      x("Senior Software Engineer", "Northwind Lending", "2022-01", null, [
        "Own the loan-servicing platform: 9 Spring Boot microservices deployed on AWS",
        "Cut infrastructure cost 30% by consolidating Redis caches and right-sizing Docker images",
        "Built a Kafka-based audit trail required for SOC 2",
      ]),
      x("Software Engineer", "Bluebird Fintech", "2020-05", "2021-12", [
        "Implemented REST API endpoints in Java for account onboarding",
        "Wrote SQL migrations and reporting views for the risk team",
      ]),
    ],
    education: [{ degree: "M.S. Computer Science", school: "Georgia Institute of Technology", year: "2020" }],
    skills: ["Java", "Spring Boot", "Microservices", "REST API", "SQL", "AWS", "Redis", "Docker", "Kafka"],
    fileName: "Priya_Raman_CV.pdf",
    receivedMinutesAgo: 47,
  },
  {
    id: "app-diego-alvarez",
    jobId: "job-backend-java",
    fullName: "Diego Alvarez",
    currentTitle: "Software Engineer",
    location: "Charlotte, NC",
    email: "diego.alvarez@example.com",
    phone: "(704) 555-0117",
    summary: "Java developer on an HR benefits platform, looking to grow into a senior backend role.",
    experience: [
      x("Software Engineer", "Harbor HR Systems", "2022-09", null, [
        "Maintain the benefits-enrollment backend written in Java and Spring Boot",
        "Added REST API endpoints for open-enrollment, serving 120k employees",
        "Optimized SQL reports for HR administrators",
      ]),
      x("Junior Developer", "Pixel Forge Studio", "2021-01", "2022-08", [
        "Built internal tools and Docker-based dev environments",
      ]),
    ],
    education: [{ degree: "B.S. Information Systems", school: "UNC Charlotte", year: "2020" }],
    skills: ["Java", "Spring Boot", "REST API", "SQL", "Docker", "Git"],
    fileName: "diego-alvarez.pdf",
    receivedMinutesAgo: 95,
  },
  {
    id: "app-hannah-okafor",
    jobId: "job-backend-java",
    fullName: "Hannah Okafor",
    currentTitle: "Backend Engineer",
    location: "Atlanta, GA",
    email: "h.okafor@example.com",
    phone: "(470) 555-0163",
    summary:
      "Backend engineer with six years across payments and fintech. Most recent work in Java; earlier work in Node.js.",
    experience: [
      x("Backend Engineer", "Tallyhouse Payments", "2023-02", null, [
        "Build Java REST API services for merchant payouts",
        "Run services on AWS with Kubernetes; on-call for payouts",
        "Wrote SQL data-quality checks that caught $1.2M in duplicate payouts",
      ]),
      x("Software Engineer", "Coinpost Fintech", "2020-08", "2023-01", [
        "Built Node.js APIs for a consumer savings app",
      ]),
    ],
    education: [{ degree: "B.S. Mathematics", school: "Spelman College", year: "2020" }],
    skills: ["Java", "REST API", "SQL", "AWS", "Kubernetes", "Node.js"],
    fileName: "hannah_okafor_2026.pdf",
    receivedMinutesAgo: 180,
  },
  {
    id: "app-tom-lindqvist",
    jobId: "job-backend-java",
    fullName: "Tom Lindqvist",
    currentTitle: "Junior Python Developer",
    location: "Savannah, GA",
    email: "tom.lindqvist@example.com",
    phone: "(912) 555-0108",
    summary: "Python developer building internal dashboards and small web apps.",
    experience: [
      x("Python Developer", "Marsh & Reed Logistics", "2024-08", null, [
        "Built Flask REST API services for shipment tracking",
        "Wrote SQL queries for weekly operations reports",
        "Packaged apps with Docker",
      ]),
    ],
    education: [{ degree: "B.S. Computer Science", school: "Savannah State University", year: "2024" }],
    skills: ["Python", "Flask", "REST API", "SQL", "Docker"],
    fileName: "TomLindqvist.pdf",
    receivedMinutesAgo: 260,
  },
  {
    id: "app-aisha-karim",
    jobId: "job-backend-java",
    fullName: "Aisha Karim",
    currentTitle: "Senior Java Engineer",
    location: "Duluth, GA",
    email: "aisha.karim@example.com",
    phone: "(770) 555-0124",
    summary: "Java engineer with five years on payments rails and settlement systems.",
    experience: [
      x("Senior Java Engineer", "Peachtree Settlement Co.", "2023-04", null, [
        "Designed Spring Boot microservices for real-time payments settlement",
        "Published REST API specs and SQL schemas for partner banks",
        "Moved batch jobs to Kafka streams on AWS",
      ]),
      x("Java Engineer", "Ironbridge Bank", "2021-09", "2023-03", ["Built Java services for wire transfers"]),
    ],
    education: [{ degree: "B.S. Computer Engineering", school: "Kennesaw State University", year: "2021" }],
    skills: ["Java", "Spring Boot", "Microservices", "REST API", "SQL", "Kafka", "AWS"],
    fileName: "scan_aisha_karim.pdf",
    extractionMethod: "ocr",
    receivedMinutesAgo: -1,
  },

  // ── Data Analyst, People Analytics ────────────────────────────────────────
  {
    id: "app-jasmine-ortiz",
    jobId: "job-data-people",
    fullName: "Jasmine Ortiz",
    currentTitle: "People Analytics Analyst",
    location: "Austin, TX",
    email: "jasmine.ortiz@example.com",
    phone: "(512) 555-0186",
    summary:
      "Analyst in people analytics for four years. I turn HRIS data into decisions about hiring, retention and pay equity.",
    experience: [
      x("People Analytics Analyst", "Fernway Health", "2022-10", null, [
        "Built Tableau attrition dashboards used by 60 HR business partners",
        "Modeled turnover risk in Python with logistic regression; presented Statistics to leadership",
        "Rebuilt the HRIS reporting layer in dbt on Snowflake",
      ]),
      x("HR Data Analyst", "Copperleaf Retail", "2021-09", "2022-09", [
        "Wrote SQL against Workday exports for monthly HR headcount reporting",
        "Automated Excel reports for 14 regional managers",
      ]),
    ],
    education: [{ degree: "B.A. Economics", school: "University of Texas at Austin", year: "2021" }],
    skills: ["SQL", "Python", "Tableau", "Statistics", "dbt", "Snowflake", "Excel"],
    fileName: "jasmine_ortiz_resume.pdf",
    receivedMinutesAgo: 22,
  },
  {
    id: "app-kevin-tran",
    jobId: "job-data-people",
    fullName: "Kevin Tran",
    currentTitle: "Data Analyst",
    location: "San Jose, CA",
    email: "kevin.tran@example.com",
    phone: "(408) 555-0131",
    summary: "Data analyst in e-commerce, strong in SQL and Python, looking for a move into people data.",
    experience: [
      x("Data Analyst", "Shopwell", "2023-06", null, [
        "Owned SQL pipelines for marketing attribution",
        "Built Python notebooks for cohort Statistics and churn analysis",
        "Published Power BI reports for the growth team",
      ]),
      x("Analytics Intern", "Shopwell", "2022-06", "2023-05", ["Cleaned order data in Excel and SQL"]),
    ],
    education: [{ degree: "B.S. Statistics", school: "San Jose State University", year: "2023" }],
    skills: ["SQL", "Python", "Statistics", "Power BI", "Excel"],
    fileName: "kevin_tran.pdf",
    receivedMinutesAgo: 75,
  },
  {
    id: "app-lena-fischer",
    jobId: "job-data-people",
    fullName: "Lena Fischer",
    currentTitle: "HR Coordinator",
    location: "Denver, CO",
    email: "lena.fischer@example.com",
    phone: "(303) 555-0150",
    summary: "HR coordinator who enjoys the reporting side of the job.",
    experience: [
      x("HR Coordinator", "Summit Outdoor Co.", "2025-09", null, [
        "Maintain HR headcount trackers in Excel",
        "Built a Power BI view of open requisitions",
      ]),
    ],
    education: [{ degree: "B.A. Psychology", school: "University of Colorado Denver", year: "2025" }],
    skills: ["Excel", "Power BI", "SQL"],
    fileName: "Lena Fischer Resume.pdf",
    receivedMinutesAgo: 140,
  },
  {
    id: "app-samuel-adeyemi",
    jobId: "job-data-people",
    fullName: "Samuel Adeyemi",
    currentTitle: "Workforce Analyst",
    location: "Columbus, OH",
    email: "samuel.adeyemi@example.com",
    phone: "(614) 555-0177",
    summary: "Workforce analyst forecasting staffing for a 3,000-person contact center.",
    experience: [
      x("Workforce Analyst", "Brightpath Contact Centers", "2024-03", null, [
        "Forecast staffing with Python time-series models and Statistics",
        "Built Tableau workforce dashboards backed by SQL on Snowflake",
        "Ran A/B testing on shift-bidding rules",
      ]),
    ],
    education: [{ degree: "B.S. Applied Mathematics", school: "Ohio State University", year: "2024" }],
    skills: ["SQL", "Python", "Tableau", "Statistics", "Snowflake", "A/B testing"],
    fileName: "s_adeyemi_resume.pdf",
    receivedMinutesAgo: -1,
  },

  // ── UX/UI Designer ────────────────────────────────────────────────────────
  {
    id: "app-mei-chen",
    jobId: "job-ux-designer",
    fullName: "Mei Chen",
    currentTitle: "Senior Product Designer",
    location: "Brooklyn, NY",
    email: "mei.chen@example.com",
    phone: "(718) 555-0112",
    summary:
      "Product designer for B2B SaaS for six years, most recently in HR tech. I run my own research and ship production-ready Figma.",
    experience: [
      x("Senior Product Designer", "Rosterly (HR tech)", "2022-04", null, [
        "Built and maintain the Figma design system used by 30 engineers",
        "Run User Research and Usability Testing every sprint with HR admins",
        "Led an Accessibility audit to WCAG 2.2 AA",
      ]),
      x("Product Designer", "Stackwise SaaS", "2020-06", "2022-03", [
        "Shipped interactive Prototyping for enterprise onboarding",
        "Pair with engineers on HTML and CSS for design QA",
      ]),
    ],
    education: [{ degree: "BFA Interaction Design", school: "Parsons School of Design", year: "2020" }],
    skills: ["Figma", "User Research", "Prototyping", "Design Systems", "Usability Testing", "Accessibility", "HTML", "CSS"],
    fileName: "mei_chen_portfolio_resume.pdf",
    receivedMinutesAgo: 8,
  },
  {
    id: "app-olivia-brooks",
    jobId: "job-ux-designer",
    fullName: "Olivia Brooks",
    currentTitle: "UX Designer",
    location: "Jersey City, NJ",
    email: "olivia.brooks@example.com",
    phone: "(201) 555-0193",
    summary: "UX designer on a SaaS scheduling product. Two years in, eager for a bigger team.",
    experience: [
      x("UX Designer", "Calendo SaaS", "2024-09", null, [
        "Design new features in Figma from sketch to handoff",
        "Run User Research interviews with small-business owners",
        "Build Prototyping flows and Motion specs for engineers",
      ]),
    ],
    education: [{ degree: "B.A. Cognitive Science", school: "Rutgers University", year: "2024" }],
    skills: ["Figma", "User Research", "Prototyping", "CSS", "Motion"],
    fileName: "OliviaBrooks_UX.pdf",
    receivedMinutesAgo: 66,
  },
  {
    id: "app-ravi-patel",
    jobId: "job-ux-designer",
    fullName: "Ravi Patel",
    currentTitle: "Graphic Designer",
    location: "Queens, NY",
    email: "ravi.patel@example.com",
    phone: "(347) 555-0170",
    summary: "Graphic designer for print and social campaigns, starting to learn product design.",
    experience: [
      x("Graphic Designer", "Bodega Creative", "2022-05", null, [
        "Design campaign assets in Illustrator and Photoshop",
        "Mocked up landing pages in Figma",
      ]),
    ],
    education: [{ degree: "AAS Graphic Design", school: "LaGuardia Community College", year: "2022" }],
    skills: ["Illustrator", "Photoshop", "Figma", "Typography"],
    fileName: "ravi_patel_design.pdf",
    receivedMinutesAgo: 210,
  },
  {
    id: "app-noah-williams",
    jobId: "job-ux-designer",
    fullName: "Noah Williams",
    currentTitle: "Product Designer",
    location: "Hoboken, NJ",
    email: "noah.williams@example.com",
    phone: "(551) 555-0135",
    summary: "Product designer working on enterprise procurement software.",
    experience: [
      x("Product Designer", "Procura (enterprise)", "2023-09", null, [
        "Extended the Figma component library and Design Systems docs",
        "Built Prototyping flows for approvals and invoicing",
        "Wrote HTML prototypes for developer handoff",
      ]),
    ],
    education: [{ degree: "B.S. Human-Computer Interaction", school: "Stevens Institute of Technology", year: "2023" }],
    skills: ["Figma", "Design Systems", "Prototyping", "HTML"],
    fileName: "noah_williams_resume.pdf",
    receivedMinutesAgo: -1,
  },
];

function toApplicant(s: Seed): Applicant {
  const resume: StructuredResume = {
    contact: { email: s.email, phone: s.phone, location: s.location },
    summary: s.summary,
    experience: s.experience,
    education: s.education,
    skills: withEvidence(s),
  };
  return {
    id: s.id.replace(/^app-/, "apl-"),
    fullName: s.fullName,
    currentTitle: s.currentTitle,
    location: s.location,
    resume,
    file: {
      fileName: s.fileName,
      source: "resume_db",
      extractionMethod: s.extractionMethod ?? "text",
      pageCount: s.pageCount ?? 1,
      rawText: renderResumeText(s),
    },
  };
}

const jobById = new Map(JOBS.map((j) => [j.id, j]));

export const APPLICANTS: Applicant[] = SEEDS.map(toApplicant);

function toApplication(s: Seed, applicant: Applicant): Application & { receivedMinutesAgo: number } {
  const job = jobById.get(s.jobId);
  if (!job) throw new Error(`Unknown job ${s.jobId}`);
  const { summary, experience, skills } = applicant.resume;
  return {
    id: s.id,
    applicantId: applicant.id,
    jobId: s.jobId,
    appliedAt: new Date(MOCK_NOW.getTime() - Math.max(0, s.receivedMinutesAgo) * 60_000).toISOString(),
    match: scoreResume({ summary, experience, skills }, job, MOCK_NOW),
    receivedMinutesAgo: s.receivedMinutesAgo,
  };
}

const ALL_APPLICATIONS = SEEDS.map((s, i) => toApplication(s, APPLICANTS[i]!));

/** Applications already in decks when the page loads. */
export const INITIAL_APPLICATIONS = ALL_APPLICATIONS.filter((a) => a.receivedMinutesAgo >= 0);

/**
 * Files still sitting in the resume database; the simulated sync pulls them one
 * at a time. `corrupt` entries never become applications and land in "Needs review".
 */
export type IncomingFile =
  | { kind: "resume"; applicationId: string; fileName: string; chars: number; sections: number; ocrPages: number[] }
  | { kind: "corrupt"; fileName: string; reason: string };

export const INCOMING_FILES: IncomingFile[] = (() => {
  const pending = ALL_APPLICATIONS.filter((a) => a.receivedMinutesAgo < 0);
  const files: IncomingFile[] = pending.map((a) => {
    const ap = APPLICANTS.find((p) => p.id === a.applicantId)!;
    return {
      kind: "resume",
      applicationId: a.id,
      fileName: ap.file.fileName,
      chars: ap.file.rawText.length,
      sections: 4,
      ocrPages: ap.file.extractionMethod === "ocr" ? [1] : [],
    };
  });
  // Put the corrupt file second so it shows up early in a demo.
  files.splice(1, 0, { kind: "corrupt", fileName: "scan_0042.pdf", reason: "Corrupt PDF: cross-reference table is missing" });
  return files;
})();

export const APPLICATIONS_BY_ID = new Map(ALL_APPLICATIONS.map((a) => [a.id, a]));
export const APPLICANTS_BY_ID = new Map(APPLICANTS.map((a) => [a.id, a]));
export const JOBS_BY_ID = jobById;
