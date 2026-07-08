import CompanySpreadsheet from "@spreadsheet-wrapper";
import { databaseDropdownFetchers } from "../spreadsheets/databaseDropdownFetchers";

export default function Spreadsheet() {
  return (
    <CompanySpreadsheet
      workbookName="Test Workbook"
      databaseProviderFetchers={databaseDropdownFetchers}
    />
  );
}