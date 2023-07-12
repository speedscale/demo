package speedscale.model;

import java.util.ArrayList;
import java.util.Date;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TreasuryResponse {
    public ArrayList<Record> data;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Record {
        public Date record_date;
        public String security_type_desc;
        public String security_desc;
        public float avg_interest_rate_amt;
        public int src_line_nbr;
        public int record_fiscal_year;
        public int record_fiscal_quarter;
        public int record_calendar_year;
        public int record_calendar_quarter;
        public int record_calendar_month;
        public int record_calendar_day;
    }
}
