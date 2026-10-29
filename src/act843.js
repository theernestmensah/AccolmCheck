// The eight principles in section 17 of Ghana's Data Protection Act, 2012 (Act 843),
// in the order the Act lists them, plus short plain-language meanings.
'use strict';
const PRINCIPLES = {
  accountability: { letter: 'a', name: 'Accountability', plain: 'Someone named is responsible for the personal data and can be reached.' },
  lawfulness: { letter: 'b', name: 'Lawfulness of processing', plain: 'There is a lawful reason, such as consent, for collecting the data.' },
  purpose: { letter: 'c', name: 'Specification of purpose', plain: 'People are told clearly why their data is being collected.' },
  compatibility: { letter: 'd', name: 'Compatibility of further processing with purpose of collection', plain: 'Data collected for one purpose is not quietly reused for another, such as marketing.' },
  quality: { letter: 'e', name: 'Quality of information', plain: 'The data collected is complete, accurate and not misleading.' },
  openness: { letter: 'f', name: 'Openness', plain: 'The organisation is open about what it collects, how and who sees it.' },
  security: { letter: 'g', name: 'Data security safeguards', plain: 'Reasonable technical measures protect the data from loss and unlawful access.' },
  participation: { letter: 'h', name: 'Data subject participation', plain: 'People can ask to see, correct or delete the data held about them.' },
};
// Sections checked against the Act text on GhaLII (Republic of Ghana, 2012).
const SECTIONS = {
  s17: 's.17 (privacy principles)',
  s19: 's.19 (minimality)',
  s20: 's.20 (consent, justification and objection)',
  s23: 's.23 (data subject to be made aware of purpose)',
  s26: 's.26 (quality of information)',
  s27: 's.27 (registration of data controller)',
  s28: 's.28 (security measures)',
  s32: 's.32 (access to personal information)',
  s33: 's.33 (correction of personal data)',
  s37: 's.37 (special personal data)',
  s40: 's.40 (direct marketing)',
  s46: 's.46 (Data Protection Register)',
};
module.exports = { PRINCIPLES, SECTIONS };
