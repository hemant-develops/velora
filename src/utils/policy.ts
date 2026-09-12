// Single source of truth for booking-policy copy shown in more than one
// place (Rental Agreement Clause 5, and the new "Deposit & Cancellation"
// section on Car Details -- see CarDetailsScreen). Defined once here so the
// two screens can never drift out of sync with each other, per the
// competitor report's own recommendation ("pull/reference it, don't fork
// it"). Every string below is copy that already existed somewhere in this
// app (RentalAgreementScreen's Clause 5, HelpSupportScreen's document
// requirements) or is a factual statement about how VELORA's payment flow
// actually works today (src/lib/paymentGateway.ts) -- nothing here is a
// fabricated number, deadline, or percentage.
export const CANCELLATION_POLICY_TEXT =
  "A late return beyond 60 minutes of the scheduled drop-off time will be billed at an additional day's rate. Cancellations made more than 24 hours before pickup are fully refundable; later cancellations may be subject to a partial service fee.";

export const BOOKING_REQUIREMENTS_TEXT =
  "A valid driver's license and a government-issued ID are required at pickup.";

// Deliberately does NOT state a deposit amount, a refundable percentage, or
// a hold deadline -- none of those exist anywhere in VELORA's data model
// (Car/Booking have no deposit field) or backend, and inventing one would
// violate the "never fabricate a deposit amount" requirement. This is the
// conservative, factually-safe alternative: it explains what's actually
// true (payment is demo-mode, see paymentGateway.ts) instead of describing
// a deposit flow that doesn't exist.
export const DEPOSIT_NOTICE_TEXT =
  'VELORA is currently running in demo payment mode — no real payment gateway is connected, so no card-based security deposit is charged or held through the app. If a deposit is needed, agree on it directly with the owner before pickup.';

// A generic, car-agnostic FAQ set for Car Details -- competitor benchmark
// screenshots showed a "Who pays for fuel?" / "How do I cancel?" style FAQ
// block, which is a genuinely useful pre-booking pattern. Every answer here
// is either a plain restatement of an existing policy string above, an
// honest description of what the app actually supports today (My Rents ->
// Booking Details for cancellation, direct messaging for anything the app
// doesn't automate), or a straightforward "ask the owner" -- nothing
// invents a fee, a km limit, a fuel policy, or any other value VELORA has
// no real data for.
// Shared support contact -- HelpSupportScreen's mailto form and the
// Terms/Privacy content below both point at this single address so they can
// never drift apart. See HelpSupportScreen's own comment: this is a real
// mailbox VELORA needs to actually own before launch, not a working
// integration built by this codebase.
export const SUPPORT_EMAIL = 'support@velora.app';

// VELORA Terms & Conditions -- written from scratch for VELORA's actual,
// narrow role (a peer-to-peer marketplace that only connects a vehicle
// Owner with a Renter), NOT adapted or copied from any other rental/car-
// sharing platform's published terms. The one fact this deliberately keeps
// central, per how VELORA actually works today: VELORA is never a party to
// the rental itself, never owns/inspects/insures a vehicle, and takes on
// none of the Owner's or Renter's obligations to each other -- it only
// provides the discovery, messaging, and booking-coordination tooling.
// Every factual claim below (payment methods, cancellation window, what
// data is required) matches what the app actually does today (see
// paymentGateway.ts, BookingsContext, the FAQ/cancellation text above) --
// nothing here promises a feature, guarantee, or protection VELORA doesn't
// actually provide. This is a solid first draft, not a substitute for
// review by a qualified lawyer before public launch -- Owner/Renter vehicle
// arrangements carry real legal and safety exposure that a template alone
// can't fully cover.
export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. What VELORA Is',
    body:
      'VELORA is a technology platform that connects individuals who want to rent out their personal vehicle ("Owners") with individuals who want to rent a vehicle for personal use ("Renters"). VELORA does not own, lease, rent, or operate any vehicle listed on the platform, is not a car rental company or transportation provider, and is not an insurer. VELORA is not a party to any rental arrangement formed between an Owner and a Renter, and has no control over the conduct, reliability, or honesty of any Owner or Renter.',
  },
  {
    heading: '2. Eligibility & Accounts',
    body:
      'You must be at least 18 years old and capable of entering a binding agreement to use VELORA. Renters must additionally hold a valid driving license appropriate to the vehicle they intend to drive. You may hold only one account, must provide accurate information, and are responsible for all activity under your account and for keeping your login credentials secure. Tell us immediately if you suspect unauthorized access to your account.',
  },
  {
    heading: '3. Listing a Vehicle (Owner Responsibilities)',
    body:
      "If you list a vehicle as an Owner, you confirm that you own the vehicle or have the legal right to list and rent it out, that it holds a valid registration certificate and valid insurance, and that it complies with applicable Indian motor vehicle laws. You are solely responsible for your vehicle's roadworthiness, cleanliness, documentation, and legal compliance, and for the accuracy of your listing (photos, price, features, availability). VELORA does not inspect, verify, or certify any vehicle and makes no guarantee about its condition, safety, or legality.",
  },
  {
    heading: '4. Booking a Vehicle (Renter Responsibilities)',
    body:
      'If you book a vehicle as a Renter, you confirm you hold a valid license for that vehicle and agree to use it only for lawful, personal use, in line with whatever you and the Owner agree at booking or pickup. You are responsible for returning the vehicle in the condition you received it (ordinary wear and tear aside), for fuel, tolls, and any fines or challans incurred during your booking, and for not using the vehicle for commercial purposes (such as ride-hailing or delivery) or outside any area agreed with the Owner, unless the Owner has explicitly agreed otherwise.',
  },
  {
    heading: "5. VELORA's Role & Limitations",
    body:
      "VELORA only provides the technology to discover vehicles, communicate, and arrange a booking. VELORA is not a party to the arrangement between an Owner and a Renter. Price, deposit, fuel and toll arrangements, the handover process, and the vehicle's condition are matters exclusively between the Owner and the Renter. VELORA does not guarantee that a listed vehicle will be available, safe, or legally compliant, that a booking will be honoured, or that any Owner or Renter will behave as expected, and is not liable for any loss, damage, injury, theft, accident, fine, or dispute arising from a booking, a vehicle, or the conduct of an Owner or Renter.",
  },
  {
    heading: '6. Payments',
    body:
      "VELORA currently supports paying the Owner directly at pickup (Cash / Pay Later); this is the only payment method that is fully live today. Other payment options shown in the app are in development and, until launched, do not move any real money. VELORA does not currently charge or hold a security deposit through the app — if a deposit is needed, it is arranged directly between the Owner and the Renter. This section will be updated once a real payment gateway is live to describe how that processor handles your payment details.",
  },
  {
    heading: '7. Cancellations & Late Returns',
    body: CANCELLATION_POLICY_TEXT,
  },
  {
    heading: '8. Messaging & Communication',
    body:
      "VELORA's in-app messaging is provided so Owners and Renters can coordinate a booking. Please avoid sharing sensitive personal or financial information beyond what's needed to complete a booking, and keep booking-related conversations in the app where possible so there's a record if something needs to be looked into later.",
  },
  {
    heading: '9. Reviews & Ratings',
    body:
      "Reviews must reflect a genuine experience with a real booking. VELORA does not create, edit, or invent reviews or ratings on behalf of any Owner or Renter, and may remove reviews that are fraudulent, abusive, or unrelated to an actual booking.",
  },
  {
    heading: '10. Reporting Concerns & Disputes',
    body:
      "VELORA provides a Report tool for flagging a listing, a person, or a conversation, and a way to raise an issue with a specific trip. We review reports raised through the app and may, at our discretion, restrict, suspend, or remove an account or listing. VELORA does not mediate financial disputes between an Owner and a Renter or guarantee any refund, compensation, or resolution — disagreements over damage, deposits, payment, or conduct are between the Owner and the Renter, and we encourage resolving them directly and in good faith, or through appropriate consumer or legal channels where needed.",
  },
  {
    heading: '11. Prohibited Conduct',
    body:
      'You agree not to: list a vehicle you have no right to list, provide false or misleading information, harass, threaten, or discriminate against another user, attempt to defraud another user or VELORA, or use VELORA for any unlawful purpose.',
  },
  {
    heading: '12. Suspension & Termination',
    body:
      'VELORA may suspend or terminate your account or remove a listing at any time, with or without notice, if we reasonably believe you have violated these Terms, put another user at risk, or misused the platform. You may stop using VELORA and close your account at any time from Settings, or by contacting us.',
  },
  {
    heading: '13. Limitation of Liability',
    body:
      'VELORA is provided "as is". To the maximum extent permitted by law, VELORA and its team are not liable for any indirect, incidental, or consequential loss arising from your use of the platform, a vehicle, or your interaction with another user, and VELORA is not a substitute for your own judgement, inspection, or legal advice before entering an arrangement with another user.',
  },
  {
    heading: '14. Your Indemnity to VELORA',
    body:
      'You agree to indemnify and hold VELORA harmless from any claim, loss, or expense (including reasonable legal fees) arising from your listing, your booking, your vehicle, or your conduct as an Owner or Renter, except where caused by VELORA\'s own gross negligence or wilful misconduct.',
  },
  {
    heading: '15. Intellectual Property',
    body:
      'The VELORA name, logo, and app are owned by VELORA. Content you upload (such as listing photos or a review) remains yours, but you grant VELORA a licence to display it on the platform for the purpose of operating the marketplace.',
  },
  {
    heading: '16. Changes to These Terms',
    body:
      "We may update these Terms from time to time. If we make a material change, we'll update the date below and, where practical, let you know in the app. Continuing to use VELORA after a change means you accept the updated Terms.",
  },
  {
    heading: '17. Governing Law & Contact',
    body: `These Terms are governed by the laws of India. For any question about these Terms, write to us at ${SUPPORT_EMAIL}.`,
  },
];

// VELORA Privacy Policy -- describes what the CURRENT build actually does
// with data (per AuthContext/Supabase for the account, and AsyncStorage for
// everything still local-only -- bookings, favorites, messages, reviews,
// reports, notifications), not a generic template claim. This needs a
// review pass every time a data store genuinely moves from local-only to a
// real backend table, so it keeps matching reality.
export const PRIVACY_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. What We Collect',
    body:
      'Your account details (name, email, phone number, password), anything you add to your profile (photo, bio, city), vehicle listing details if you list a car, booking details, in-app messages between an Owner and a Renter, reviews you write, and any report you submit. If you grant location access, we use it only to help set your pickup city.',
  },
  {
    heading: '2. How We Use It',
    body:
      "To run the marketplace: show and manage listings, create and track bookings, connect Owners with Renters, power in-app messaging and notifications, show ratings and reviews, respond to support requests, and improve the app.",
  },
  {
    heading: '3. Where It Lives',
    body:
      'Your account and sign-in are handled by our backend. In the current version of the app, your bookings, favorites, messages, reviews, notifications, and reports are stored locally on your device rather than a central server — this section will be updated as VELORA moves more of that onto our backend.',
  },
  {
    heading: '4. Sharing With Other Users',
    body:
      "We only share what's needed for an Owner and a Renter to complete a booking together — such as your name, photo, and, once a booking connects you, an appropriate way to contact each other. We never sell your personal data to advertisers or other third parties, and only disclose it beyond the platform where required by law or to investigate a genuine safety or fraud report.",
  },
  {
    heading: '5. Payments',
    body:
      "VELORA does not store your card, UPI, or bank details. Cash payments at pickup are arranged directly with the Owner. When a real online payment method is live, your payment details will be handled directly and securely by that licensed payment processor, not stored by VELORA.",
  },
  {
    heading: '6. Your Choices',
    body:
      `You can review and update your profile any time from Settings. To request a copy of your data or to delete your account, use Settings → Delete Account, or email us at ${SUPPORT_EMAIL} and we'll act on it.`,
  },
  {
    heading: '7. Security',
    body:
      "We use reasonable technical and organisational measures to protect your data, but no method of storage or transmission is completely secure, and we can't guarantee absolute security.",
  },
  {
    heading: "8. Children's Privacy",
    body: 'VELORA is intended for users 18 and older and is not directed at children.',
  },
  {
    heading: '9. Changes to This Policy',
    body:
      "We may update this Privacy Policy from time to time. If we make a material change, we'll update the date below and, where practical, let you know in the app.",
  },
  {
    heading: '10. Contact Us',
    body: `Questions about this Privacy Policy or your data can be sent to ${SUPPORT_EMAIL}.`,
  },
];

export const CAR_DETAILS_FAQS: { question: string; answer: string }[] = [
  {
    question: 'How do I cancel my booking?',
    answer: 'Go to My Rents, open the booking, and cancel from there. See the Cancellation Policy above for refund eligibility.',
  },
  {
    question: 'Is a security deposit charged?',
    answer: DEPOSIT_NOTICE_TEXT,
  },
  {
    question: 'What do I need to bring at pickup?',
    answer: BOOKING_REQUIREMENTS_TEXT,
  },
  {
    question: "Who pays for fuel, tolls, or a FASTag recharge?",
    answer: "This isn't fixed by the app — agree on fuel and toll arrangements directly with the owner, either before booking or at pickup.",
  },
  {
    question: 'Can I extend or modify my trip after booking?',
    answer: "In-app trip extension isn't supported yet. Message the owner directly to check if a longer rental can be arranged.",
  },
];
