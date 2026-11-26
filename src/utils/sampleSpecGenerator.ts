import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface SampleSectionDef {
  header: string;
  title: string;
  paragraphs: string[];
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderSpecBookPdf(
  projectTitle: string,
  issueStamp: string,
  architectLine: string,
  sections: SampleSectionDef[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 54;
  const bodyTopY = pageHeight - 92;
  const bodyBottomY = 78;
  const lineHeight = 14.5;

  // Build pages first so we know total page count for realistic footers
  const pagesData: Array<{
    sectionCodeForFooter: string;
    items: Array<{ text: string; bold: boolean; y: number; size: number }>;
  }> = [];

  for (const section of sections) {
    const codeMatch = section.header.match(/(\d{2}\s+\d{2,4}(?:\s+\d{2})?)/);
    const footerCode = codeMatch ? codeMatch[1] : '00 00 00';
    let currentY = bodyTopY;
    let currentItems: Array<{ text: string; bold: boolean; y: number; size: number }> = [];

    const pushPage = () => {
      pagesData.push({ sectionCodeForFooter: footerCode, items: currentItems });
      currentItems = [];
      currentY = bodyTopY;
    };

    currentItems.push({
      text: `${section.header} - ${section.title}`,
      bold: true,
      y: currentY,
      size: 11.5,
    });
    currentY -= 22;

    for (const para of section.paragraphs) {
      const wrapped = wrapText(para, 84);
      const neededHeight = wrapped.length * lineHeight + 10;
      if (currentY - neededHeight < bodyBottomY && currentItems.length > 0) {
        pushPage();
      }
      for (const line of wrapped) {
        if (currentY < bodyBottomY) {
          pushPage();
        }
        currentItems.push({
          text: line,
          bold: /^\d+\.\d+\s/.test(line) || /^PART\s+\d/i.test(line),
          y: currentY,
          size: 10,
        });
        currentY -= lineHeight;
      }
      currentY -= 8;
    }

    if (currentItems.length > 0) {
      pushPage();
    }
  }

  const totalPages = pagesData.length;

  pagesData.forEach((pData, idx) => {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageNum = idx + 1;

    // Top 10% repeating header (yPct <= 0.10)
    page.drawText(projectTitle, {
      x: marginX,
      y: pageHeight - 36,
      size: 8.5,
      font: fontBold,
      color: rgb(0.25, 0.3, 0.38),
    });
    page.drawText(issueStamp, {
      x: pageWidth - marginX - 185,
      y: pageHeight - 36,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.25, 0.3, 0.38),
    });
    page.drawText(architectLine, {
      x: marginX,
      y: pageHeight - 48,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.45, 0.52),
    });

    // Body text
    for (const item of pData.items) {
      page.drawText(item.text, {
        x: marginX,
        y: item.y,
        size: item.size,
        font: item.bold ? fontBold : fontRegular,
        color: rgb(0.06, 0.09, 0.16),
      });
    }

    // Bottom 10% repeating footer (yPct >= 0.90)
    page.drawText(`${pData.sectionCodeForFooter} - ${pageNum}`, {
      x: marginX,
      y: 34,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.48),
    });
    page.drawText(`Page ${pageNum} of ${totalPages}`, {
      x: pageWidth - marginX - 72,
      y: 34,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.48),
    });
  });

  return pdfDoc.save();
}

const OLD_SECTIONS: SampleSectionDef[] = [
  {
    header: 'SECTION 01 21 00',
    title: 'ALLOWANCES',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: This Section includes administrative and procedural requirements governing cash allowances included in the Base Bid.',
      '1.2 SCHEDULE OF ALLOWANCES: Allowance No. 1 - Ornamental Lobby Metalwork: Include a lump sum allowance of $45,000 for custom bronze elevator lobby trim.',
      '1.3 Allowance No. 2 - Soil Remediation Contingency: Include an allowance of $28,000 for unforeseen unsuitable subsurface soils beneath Building Wing B.',
    ],
  },
  {
    header: 'SECTION 03 30 00',
    title: 'CAST-IN-PLACE CONCRETE',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install all cast-in-place structural concrete, formwork, reinforcing steel, vapor retarders, and curing compounds.',
      'PART 2 PRODUCTS',
      '2.1 CONCRETE MIXTURES: Normal-weight structural concrete for elevated post-tensioned slabs and shear walls shall achieve a minimum 28-day compressive strength of 4000 PSI with a maximum water-cementitious ratio of 0.45.',
      '2.2 VAPOR RETARDERS: Below-slab polyethylene sheet vapor retarder per ASTM E1745 Class A, minimum 15 mil nominal thickness with 6-inch lapped seams taped per manufacturer instructions.',
      '2.3 CURING AND SEALING: Apply liquid membrane-forming curing compound meeting ASTM C309 immediately after finishing operations.',
    ],
  },
  {
    header: 'SECTION 04 22 00',
    title: 'CONCRETE UNIT MASONRY',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Section includes standard hollow load-bearing concrete masonry units (CMU), mortar, grout, and joint reinforcement for interior stairwell shaft walls.',
      '2.1 MATERIALS: Normal-weight CMU conforming to ASTM C90, nominal 8-inch thickness, minimum net area compressive strength of 1900 PSI.',
    ],
  },
  {
    header: 'SECTION 07 54 23',
    title: 'THERMOPLASTIC POLYOLEFIN (TPO) ROOFING',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Mechanically attached white TPO single-ply roofing membrane system over rigid polyisocyanurate insulation.',
      '1.2 WARRANTY: Manufacturer shall provide a standard 15-year No Dollar Limit (NDL) total system material and labor warranty covering wind speeds up to 72 mph.',
      '2.1 MEMBRANE: Reinforced 60 mil nominal thickness white TPO sheet complying with ASTM D6878.',
    ],
  },
  {
    header: 'SECTION 08 71 00',
    title: 'DOOR HARDWARE',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install finish door hardware, cylinders, electrified strikes, and threshold accessories for all architectural openings.',
      '1.2 QUALITY ASSURANCE: Fire-rated door assemblies shall bear UL 10C positive pressure labels for 90-minute rated stairwell openings.',
      '2.1 ELECTRIFIED HARDWARE: Furnish and install 24V DC fail-secure electric mortise locksets and door position switches at Security Doors 104, 108, and 212.',
      '2.2 CLOSERS AND EXIT DEVICES: Heavy-duty cast iron surface door closers conforming to ANSI/BHMA A156.4 Grade 1, Basis of Design: LCN 4040XP, or approved equal.',
    ],
  },
  {
    header: 'SECTION 23 05 93',
    title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Independent AABC or NEBB certified testing and balancing agency retained by the Mechanical Subcontractor to balance air and hydronic systems.',
      '2.1 TOLERANCES: Balance supply air terminal units within plus or minus 10% of design CFM shown on Mechanical Schedules.',
      '2.2 COORDINATION: Provide 24-hour advance notice to the Commissioning Authority prior to final duct leakage pressure testing.',
    ],
  },
  {
    header: 'SECTION 26 24 13',
    title: 'SWITCHBOARDS',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install main 2500A, 480Y/277V, 3-phase, 4-wire service entrance switchboard with integral ground fault protection.',
      '2.1 RATINGS AND BUSING: Silver-plated copper main bus rated 2500A with minimum 65,000 AIC symmetrical interrupting rating. Basis of Design: Eaton Pow-R-Line C or approved equal.',
      '3.1 EXECUTION: Coordinate utility CT compartment dimensions with local electric utility standards prior to shop drawing submittal.',
    ],
  },
];

const NEW_SECTIONS: SampleSectionDef[] = [
  {
    header: 'SECTION 01 21 00',
    title: 'ALLOWANCES',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: This Section includes administrative and procedural requirements governing cash allowances included in the Base Bid.',
      '1.2 SCHEDULE OF ALLOWANCES: Allowance No. 1 - Ornamental Lobby Metalwork: Include a lump sum allowance of $62,500 for custom bronze elevator lobby trim and perforated acoustic backing.',
      '1.3 Allowance No. 2 - Soil Remediation Contingency: Include an allowance of $28,000 for unforeseen unsuitable subsurface soils beneath Building Wing B.',
      '1.4 ADDENDUM CLARIFICATION: Contractor shall include all overhead, profit, and bond costs on allowances within the Base Bid outside the stated allowance amounts. Unexpended allowance balances shall be credited 100% to the Owner via deductive Change Order.',
      '1.5 SUBMITTAL SCHEDULE: Submit allowance expenditure logs monthly alongside Application for Payment documentation. Retain certified vendor invoices for Owner audit for 3 years following Substantial Completion.',
      '1.6 ALLOWANCE NO. 3 - TERRAZZO TRANSITION STRIPS: Include an allowance of $14,500 for custom brass divider strips at Level 1 Main Atrium.',
      '1.7 ALLOWANCE NO. 4 - ACOUSTIC ISOLATION PADS: Include an allowance of $19,200 for spring-neoprene vibration isolators beneath Imaging Suite equipment.',
      '1.8 ALLOWANCE NO. 5 - SIGNAGE & WAYFINDING ROUGH-IN: Include an allowance of $11,000 for concealed blocking and low-voltage backboxes at illuminated directory monuments.',
      '1.9 ALLOWANCE NO. 6 - WINTER PROTECTION CONTINGENCY: Include an allowance of $22,000 for temporary insulated enclosures if foundation pours extend past November 15.',
      '1.10 ALLOWANCE NO. 7 - THIRD-PARTY ENVELOPE COMMISSIONING SUPPORT: Include an allowance of $16,500 for contractor labor supporting ASTM E1105 water intrusion field tests.',
      '1.11 CLOSEOUT RECONCILIATION: Unused allowance balances shall be reconciled prior to Final Application for Payment through formal Change Order executed by Owner and Architect.',
    ],
  },
  {
    header: 'SECTION 03 30 00',
    title: 'CAST-IN-PLACE CONCRETE',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install all cast-in-place structural concrete, formwork, reinforcing steel, vapor retarders, and curing compounds.',
      '1.2 ADDITIONAL PLACEMENT PROTOCOL: Hot and cold weather concreting procedures per ACI 305R and ACI 306R are mandatory whenever ambient temperatures exceed 85 degrees F or fall below 40 degrees F.',
      '1.3 SUBMITTALS: Submit concrete mix designs stamped by a licensed Structural Engineer for each strength class at least 21 calendar days prior to initial concrete placement, including aggregate gradation curves and 28-day trial batch cylinder break reports.',
      '1.4 QUALITY ASSURANCE: Independent testing laboratory retained by the Owner will perform slump, air content, temperature, and compressive strength cylinder tests per ASTM C31 and ASTM C39 on every 50 cubic yards placed.',
      'PART 2 PRODUCTS',
      '2.1 CONCRETE MIXTURES: Normal-weight structural concrete for elevated post-tensioned slabs and shear walls shall achieve a minimum 28-day compressive strength of 5000 PSI with a maximum water-cementitious ratio of 0.40 and minimum 20% Class F fly ash substitution.',
      '2.2 VAPOR RETARDERS: Below-slab polyethylene sheet vapor retarder per ASTM E1745 Class A, minimum 20 mil nominal thickness with 6-inch lapped seams taped per manufacturer instructions.',
      '2.3 CURING AND SEALING: Apply liquid membrane-forming curing compound meeting ASTM C309 immediately after finishing operations.',
      '2.4 REINFORCING STEEL: Deformed billet-steel bars conforming to ASTM A615 Grade 60, epoxy-coated per ASTM A775 at all exterior loading dock ramps and ambulance canopy foundation piers.',
      'PART 3 EXECUTION',
      '3.1 SLAB TOLERANCES: Finish interior structural slabs-on-grade to achieve minimum overall flatness FF 35 and levelness FL 25 per ASTM E1155 within 72 hours of placement.',
      '3.2 COLD JOINTS AND WATERSTOPS: Install hydrophilic bentonite waterstops centered in all below-grade elevator pit construction joints and perimeter foundation wall keyways.',
      '3.3 FIELD CURING: Maintain moist curing conditions continuously for minimum 7 calendar days on elevated post-tensioned decks prior to stressing operations.',
    ],
  },
  // SECTION 04 22 00 intentionally DELETED in Addendum 01!
  {
    header: 'SECTION 07 54 23',
    title: 'THERMOPLASTIC POLYOLEFIN (TPO) ROOFING',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Mechanically attached white TPO single-ply roofing membrane system over rigid polyisocyanurate insulation.',
      '1.2 WARRANTY: Manufacturer shall provide a 20-year No Dollar Limit (NDL) total system material and labor warranty covering wind speeds up to 90 mph.',
      '2.1 MEMBRANE: Reinforced 80 mil nominal thickness white TPO sheet complying with ASTM D6878.',
    ],
  },
  {
    // Inconsistent CSI spacing trap: "SECTION 08 7100" instead of "SECTION 08 71 00"
    header: 'SECTION 08 7100',
    title: 'DOOR HARDWARE',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install finish door hardware, cylinders, electrified strikes, and threshold accessories for all architectural openings, except as noted in Paragraph 2.1.',
      '1.2 QUALITY ASSURANCE: Fire-rated door assemblies shall bear UL 10C positive pressure labels for 90-minute rated stairwell openings.',
      '2.1 ELECTRIFIED HARDWARE: Install only 24V DC fail-secure electric mortise locksets and card readers furnished by Owner security integrator at Security Doors 104, 108, 212, and Pharmacy Vault 118. Coordinate rough-in conduit with Division 28.',
      '2.2 CLOSERS AND EXIT DEVICES: Heavy-duty cast iron surface door closers conforming to ANSI/BHMA A156.4 Grade 1, Basis of Design: LCN 4040XP, no substitutions permitted.',
    ],
  },
  {
    // Added new section in Addendum 01
    header: 'SECTION 13 31 00',
    title: 'TENSIONED FABRIC STRUCTURES',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Design, engineer, furnish, and install architectural PTFE-coated fiberglass tensioned canopy over South Ambulance Drop-Off.',
      '1.2 ENGINEERING: Structural canopy frames and cable anchorage shall be stamped by a licensed Structural Engineer for 115 mph 3-second gust wind loads.',
      '1.3 ALLOWANCE: Alternate No. 3 governs optional LED uplighting integration.',
    ],
  },
  {
    // Shifted down 2 pages by earlier edits, yet UNCHANGED content -> must NOT trigger Bluebeam-style page-shift false positives!
    header: 'SECTION 23 05 93',
    title: 'TESTING, ADJUSTING, AND BALANCING FOR HVAC',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Independent AABC or NEBB certified testing and balancing agency retained by the Mechanical Subcontractor to balance air and hydronic systems.',
      '2.1 TOLERANCES: Balance supply air terminal units within plus or minus 10% of design CFM shown on Mechanical Schedules.',
      '2.2 COORDINATION: Provide 24-hour advance notice to the Commissioning Authority prior to final duct leakage pressure testing.',
    ],
  },
  {
    header: 'SECTION 26 24 13',
    title: 'SWITCHBOARDS',
    paragraphs: [
      'PART 1 GENERAL',
      '1.1 SUMMARY: Furnish and install main 2500A, 480Y/277V, 3-phase, 4-wire service entrance switchboard with integral ground fault protection.',
      '2.1 RATINGS AND BUSING: Tin-plated copper main bus rated 2500A with minimum 85,000 AIC symmetrical interrupting rating. Basis of Design: Eaton Pow-R-Line C or Square D QED-2.',
      '3.1 EXECUTION: Coordinate utility CT compartment dimensions with local electric utility standards prior to shop drawing submittal. Provide temporary 800A generator quick-connect tap box if main switchboard lead time exceeds 28 weeks.',
    ],
  },
];

export async function generateSampleProjectManuals(): Promise<{
  oldBytes: Uint8Array;
  newBytes: Uint8Array;
  oldFileName: string;
  newFileName: string;
}> {
  const [oldBytes, newBytes] = await Promise.all([
    renderSpecBookPdf(
      'DOWNTOWN MEDICAL PAVILION — PROJECT MANUAL',
      'ISSUED FOR BID — JUL 18, 2026',
      'VANGUARD ARCHITECTS LLP · PERMIT SET',
      OLD_SECTIONS
    ),
    renderSpecBookPdf(
      'DOWNTOWN MEDICAL PAVILION — PROJECT MANUAL',
      'ADDENDUM 01 — AUG 14, 2026',
      'VANGUARD ARCHITECTS LLP · ADDENDUM 01',
      NEW_SECTIONS
    ),
  ]);

  return {
    oldBytes,
    newBytes,
    oldFileName: 'Downtown_Medical_Pavilion_IFB_Manual.pdf',
    newFileName: 'Downtown_Medical_Pavilion_Addendum_01.pdf',
  };
}
