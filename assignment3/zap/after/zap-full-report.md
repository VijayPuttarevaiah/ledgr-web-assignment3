# ZAP by Checkmarx Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Informational | 3 |






## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: script-src unsafe-inline | Medium | Systemic |
| Content-Type Header Missing | Informational | 1 |
| User Agent Fuzzer | Informational | Systemic |
| User Controllable HTML Element Attribute (Potential XSS) | Informational | 1 |




## Alert Detail



### [ CSP: script-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://host.docker.internal:3100
  * Node Name: `http://host.docker.internal:3100`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-CTwys839LPY/OA+GfpqVhA=='; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/api
  * Node Name: `http://host.docker.internal:3100/api`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-w6VD22b7JzUD7mAIiKt8aA=='; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/invite
  * Node Name: `http://host.docker.internal:3100/invite`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-U6o0qiRvZ4Ygck00yddztw=='; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/ledger
  * Node Name: `http://host.docker.internal:3100/ledger`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-8OVulr6mcNzC1qiF2SxOHQ=='; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/sitemap.xml
  * Node Name: `http://host.docker.internal:3100/sitemap.xml`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'nonce-hOMkaT4sYGStKwwdM7KmrA=='; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`

Instances: Systemic


### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Content-Type Header Missing ](https://www.zaproxy.org/docs/alerts/10019/)



##### Informational (Medium)

### Description

The Content-Type header was either missing or empty.

* URL: http://host.docker.internal:3100/api/
  * Node Name: `http://host.docker.internal:3100/api/`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 1

### Solution

Ensure each page is setting the specific and appropriate content-type value for the content being delivered.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))


#### CWE Id: [ 345 ](https://cwe.mitre.org/data/definitions/345.html)


#### WASC Id: 12

#### Source ID: 3

### [ User Agent Fuzzer ](https://www.zaproxy.org/docs/alerts/10104/)



##### Informational (Medium)

### Description

Check for differences in response based on fuzzed User Agent (eg. mobile sites, access as a Search Engine Crawler). Compares the response statuscode and the hashcode of the response body with the original response.

* URL: http://host.docker.internal:3100/analytics
  * Node Name: `http://host.docker.internal:3100/analytics`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: http://host.docker.internal:3100/api/
  * Node Name: `http://host.docker.internal:3100/api/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``
* URL: http://host.docker.internal:3100/invite/
  * Node Name: `http://host.docker.internal:3100/invite/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1)`
  * Evidence: ``
  * Other Info: ``

Instances: Systemic


### Solution



### Reference


* [ https://owasp.org/wstg ](https://owasp.org/wstg)



#### Source ID: 1

### [ User Controllable HTML Element Attribute (Potential XSS) ](https://www.zaproxy.org/docs/alerts/10031/)



##### Informational (Low)

### Description

This check looks at user-supplied input in query string parameters and POST data to identify where certain HTML attribute values might be controlled. This provides hot-spot detection for XSS (cross-site scripting) that will require further review by a security analyst to determine exploitability.

* URL: http://host.docker.internal:3100/ledger%3Ffilter=all&page=1
  * Node Name: `http://host.docker.internal:3100/ledger (filter,page)`
  * Method: `GET`
  * Parameter: `page`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://host.docker.internal:3100/ledger?filter=all&page=1

appears to include user input in:
a(n) [meta] tag [content] attribute

The user input found was:
page=1

The user-controlled value was:
width=device-width, initial-scale=1`


Instances: 1

### Solution

Validate all input and sanitize output it before writing to any HTML attributes.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)


#### CWE Id: [ 20 ](https://cwe.mitre.org/data/definitions/20.html)


#### WASC Id: 20

#### Source ID: 3


