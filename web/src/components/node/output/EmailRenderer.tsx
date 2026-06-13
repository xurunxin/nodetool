/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { useTranslation } from "react-i18next";

export type Email = {
  sender: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

export const EmailRenderer: React.FC<{ value: Email }> = ({ value }) => {
  const { t } = useTranslation("nodeMenu");
  const theme = useTheme();
  return (
    <div css={outputStyles(theme)}>
      <div className="email-header">
        <p>
          <strong>{t("emailFrom")}:</strong> {value.sender}
        </p>
        <p>
          <strong>{t("emailTo")}:</strong> {value.to}
        </p>
        {value.cc && (
          <p>
            <strong>{t("emailCc")}:</strong> {value.cc}
          </p>
        )}
        <p>
          <strong>{t("emailSubject")}:</strong> {value.subject}
        </p>
      </div>
      <div className="email-body">
        <MaybeMarkdown text={value.body} />
      </div>
    </div>
  );
};

export default memo(EmailRenderer);
