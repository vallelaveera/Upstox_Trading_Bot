import { Link } from "react-router-dom";
import { Plug, EnvelopeSimple, LinkedinLogo, GithubLogo, DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const SKILLS = [
  "Certified Product Owner", "Product Management", "Agile / SCRUM",
  "Python Development", "NLP & LLM Integration", "RAG Systems",
  "AWS Lambda", "Azure / Azure Boards", "Dagster Pipelines",
  "Elasticsearch", "Data Enrichment", "Entity Resolution",
  "Large-scale Web Scraping", "MCP Server Integration", "OpenAI API",
  "GitHub", "MIRO / ASANA",
];

const EXPERIENCE = [
  {
    title: "AI/Data Product Owner",
    company: "Matchory GmbH",
    location: "Heilbronn, Germany",
    period: "03/2025 – Present",
    bullets: [
      "Shipped scalable AI-powered data products and REST APIs for enterprise clients.",
      "Delivered AI solutions for entity resolution and automated data extraction.",
      "Built real-time data enrichment pipelines leveraging the latest LLMs.",
      "Implemented scalable orchestration workflows using Dagster for production-grade data processing.",
      "Developed RAG systems and integrated MCP servers to enhance data retrieval capabilities.",
    ],
  },
  {
    title: "Data Product Owner",
    company: "7Q1 — AI Based Supplier Search Engine",
    location: "Stuttgart, Germany",
    period: "05/2020 – 03/2025",
    bullets: [
      "Conceptualised, built, and launched an AI-powered supplier discovery platform end-to-end using Python's ANVIL framework.",
      "Implemented NLP-based information extraction pipelines in Python for supplier intelligence.",
      "Led a fully remote, cross-functional team of 12 engineers and data specialists.",
      "Established SCRUM workflows and sprint cycles on Microsoft Azure Boards.",
      "Deployed and managed thousands of AWS Lambda functions for cloud-native, serverless execution.",
    ],
  },
  {
    title: "Data Engineer & 1st Employee",
    company: "Scoutbee GmbH",
    location: "Würzburg, Germany",
    period: "11/2016 – 03/2020",
    bullets: [
      "Joined as first employee, contributing to foundational aspects of company development.",
      "Developed core algorithms and automated processes for global supplier discovery using Python.",
      "Led supplier data collection, enrichment, and quality evaluation pipelines.",
      "Built and scaled a remote team of 25 and established data collaboration partnerships in India.",
      "Contributed to the $76M funding journey.",
    ],
  },
  {
    title: "Intern & Master's Thesis",
    company: "Bosch Power Tools",
    location: "",
    period: "09/2015 – 09/2016",
    bullets: [
      "Defined and built Microsoft SSIS interfaces for seamless data integration and ETL workflows.",
      "Developed and deployed reporting front-ends integrated with enterprise data systems.",
      "Implemented SQL Server Reporting (SSRS) solutions to enhance BI dashboard capabilities.",
    ],
  },
];

const EDUCATION = [
  { degree: "M.Sc., Software Engineering", school: "Hochschule Heilbronn", year: "2016" },
  { degree: "B.Tech., Information Technology", school: "JNTU University", year: "2012" },
];

const LANGUAGES = ["English — Fluent", "German — Intermediate", "Hindi — Intermediate"];

export default function About() {
  return (
    <div className="min-h-screen bg-[#050505] text-white bg-grid bg-noise">
      {/* Header */}
      <header className="border-b border-white/5 sticky top-0 z-30 backdrop-blur-md bg-[#050505]/80">
        <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Signal Forge" className="h-10 w-10" />
            <div>
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight leading-none">
                Signal <span className="text-[#00C896]">Forge</span>
              </h1>
              <p className="text-[11px] text-neutral-500 uppercase tracking-[0.2em] mt-1">
                Real Time Simulator &amp; Trading Bot
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/chat">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 font-semibold tracking-wide text-xs">
                AI Research
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 font-semibold tracking-wide text-xs">
                Simulator
              </Button>
            </Link>
            <Link to="/live">
              <Button className="bg-[#00C896] hover:bg-[#00A882] text-black font-bold tracking-wide text-xs">
                <Plug size={14} weight="fill" className="mr-2" />
                Go Live
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 md:px-8 py-12 space-y-14">

        {/* Profile */}
        <section className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="shrink-0">
            <img
              src="/photo.jpg"
              alt="Veera Reddy Vallela"
              className="h-36 w-36 rounded-full object-cover border-2 border-[#00C896]/40"
            />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Veera Reddy <span className="text-[#00C896]">Vallela</span>
            </h2>
            <p className="mt-1 text-neutral-400 text-sm uppercase tracking-[0.15em] font-medium">
              AI / Data Product Owner · Python Engineer
            </p>
            <p className="mt-5 text-neutral-300 leading-relaxed max-w-xl text-sm md:text-base">
              With over 8 years of experience building data-driven and AI-powered products,
              I specialise in turning complex, unstructured textual data into scalable,
              real-world solutions. From being the 1st employee at Scoutbee — where I helped
              shape a platform that raised $76M — to co-founding 7Q1, an AI-based Supplier
              Search Engine led from scratch with a remote team of 12. I bring a rare
              combination of product thinking, hands-on Python development, and deep NLP
              expertise.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 justify-center md:justify-start">
              <a
                href="mailto:veera.reddy619@gmail.com"
                className="flex items-center gap-2 text-xs text-neutral-400 hover:text-[#00C896] transition-colors border border-white/10 hover:border-[#00C896]/40 rounded-lg px-4 py-2"
              >
                <EnvelopeSimple size={15} />
                veera.reddy619@gmail.com
              </a>
              <a
                href="https://www.linkedin.com/in/veera-reddy-v-70639861/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-neutral-400 hover:text-[#00C896] transition-colors border border-white/10 hover:border-[#00C896]/40 rounded-lg px-4 py-2"
              >
                <LinkedinLogo size={15} />
                LinkedIn
              </a>
              <a
                href="https://github.com/vallelaveera"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-neutral-400 hover:text-[#00C896] transition-colors border border-white/10 hover:border-[#00C896]/40 rounded-lg px-4 py-2"
              >
                <GithubLogo size={15} />
                GitHub
              </a>
              <a
                href="/cv.pdf"
                download
                className="flex items-center gap-2 text-xs bg-[#00C896] hover:bg-[#00A882] text-black font-bold rounded-lg px-4 py-2 transition-colors"
              >
                <DownloadSimple size={15} weight="bold" />
                Download CV
              </a>
            </div>
          </div>
        </section>

        {/* Skills */}
        <section>
          <SectionHeading>Skills</SectionHeading>
          <div className="flex flex-wrap gap-2 mt-4">
            {SKILLS.map((s) => (
              <span
                key={s}
                className="text-xs border border-white/10 text-neutral-300 rounded-full px-3 py-1 bg-white/[0.03] hover:border-[#00C896]/40 hover:text-[#00C896] transition-colors"
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section>
          <SectionHeading>Experience</SectionHeading>
          <div className="mt-4 space-y-8">
            {EXPERIENCE.map((job) => (
              <div key={job.title + job.company} className="relative pl-5 border-l border-white/10">
                <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#00C896]" />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-display font-bold text-white text-sm">{job.title}</span>
                  <span className="text-[#00C896] text-xs font-semibold">{job.company}</span>
                  {job.location && <span className="text-neutral-500 text-xs">{job.location}</span>}
                </div>
                <p className="text-neutral-500 text-xs mt-0.5 mb-3 font-mono">{job.period}</p>
                <ul className="space-y-1.5">
                  {job.bullets.map((b) => (
                    <li key={b} className="text-neutral-400 text-sm leading-relaxed flex gap-2">
                      <span className="text-[#00C896] mt-1.5 shrink-0">›</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Education & Languages */}
        <div className="grid md:grid-cols-2 gap-8">
          <section>
            <SectionHeading>Education</SectionHeading>
            <div className="mt-4 space-y-4">
              {EDUCATION.map((e) => (
                <div key={e.degree} className="pl-5 border-l border-white/10 relative">
                  <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#00C896]" />
                  <p className="font-semibold text-sm text-white">{e.degree}</p>
                  <p className="text-[#00C896] text-xs">{e.school}</p>
                  <p className="text-neutral-500 text-xs font-mono">{e.year}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionHeading>Languages</SectionHeading>
            <div className="mt-4 space-y-2">
              {LANGUAGES.map((l) => (
                <p key={l} className="text-sm text-neutral-300 pl-5 border-l border-white/10">
                  {l}
                </p>
              ))}
            </div>
          </section>
        </div>

        {/* CV viewer */}
        <section>
          <SectionHeading>Curriculum Vitae</SectionHeading>
          <div className="mt-4 border border-white/10 rounded-xl overflow-hidden bg-[#0a0a0a]">
            <iframe
              src="/cv.pdf"
              title="Veera Reddy Vallela — CV"
              className="w-full"
              style={{ height: "85vh", minHeight: 600 }}
            />
          </div>
        </section>

      </main>
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="font-display text-lg font-bold tracking-tight text-white">{children}</h3>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}
