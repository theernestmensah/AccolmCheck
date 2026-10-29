#!/bin/bash
set -e
D=/workspace/accolm-check/docs
soffice --headless --invisible "macro:///Standard.IARTools.UpdateAndExport(\"file://$D/draft.docx\",\"file://$D/../AccolmCheck_Project_Report.docx\",\"file://$D/../AccolmCheck_Project_Report.pdf\")"
