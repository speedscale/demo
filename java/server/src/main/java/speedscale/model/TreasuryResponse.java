package speedscale.model;

import java.util.ArrayList;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TreasuryResponse {
    public ArrayList<Record> data;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Record {
        public String record_date;
        public String security_type_desc;
        public String security_desc;
        public String avg_interest_rate_amt;
        public String src_line_nbr;
        public String record_fiscal_year;
        public String record_fiscal_quarter;
        public String record_calendar_year;
        public String record_calendar_quarter;
        public String record_calendar_month;
        public String record_calendar_day;
    }

}
