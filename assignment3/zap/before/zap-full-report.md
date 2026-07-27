# ZAP by Checkmarx Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 3 |
| Low | 1 |
| Informational | 4 |






## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: script-src unsafe-inline | Medium | Systemic |
| CSP: style-src unsafe-inline | Medium | Systemic |
| Format String Error | Medium | 1 |
| Big Redirect Detected (Potential Sensitive Information Leak) | Low | 1 |
| Content-Type Header Missing | Informational | 3 |
| Modern Web Application | Informational | 1 |
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
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/analytics
  * Node Name: `http://host.docker.internal:3100/analytics`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/api
  * Node Name: `http://host.docker.internal:3100/api`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/settings
  * Node Name: `http://host.docker.internal:3100/settings`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/sitemap.xml
  * Node Name: `http://host.docker.internal:3100/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
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

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://host.docker.internal:3100
  * Node Name: `http://host.docker.internal:3100`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/analytics
  * Node Name: `http://host.docker.internal:3100/analytics`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/api
  * Node Name: `http://host.docker.internal:3100/api`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/settings
  * Node Name: `http://host.docker.internal:3100/settings`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://host.docker.internal:3100/sitemap.xml
  * Node Name: `http://host.docker.internal:3100/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  * Other Info: `style-src includes unsafe-inline.`

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

### [ Format String Error ](https://www.zaproxy.org/docs/alerts/30002/)



##### Medium (Medium)

### Description

A Format String error occurs when the submitted data of an input string is evaluated as a command by the application.

* URL: http://host.docker.internal:3100/api/transactions/export%3Ffilter=ZAP%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%2525n%2525s%250A
  * Node Name: `http://host.docker.internal:3100/api/transactions/export (filter)`
  * Method: `GET`
  * Parameter: `filter`
  * Attack: `ZAP%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s%n%s
`
  * Evidence: ``
  * Other Info: `Potential Format String Error. The script closed the connection on a /%s.`


Instances: 1

### Solution

Rewrite the background program using proper deletion of bad character strings. This will require a recompile of the background executable.

### Reference


* [ https://owasp.org/www-community/attacks/Format_string_attack ](https://owasp.org/www-community/attacks/Format_string_attack)


#### CWE Id: [ 134 ](https://cwe.mitre.org/data/definitions/134.html)


#### WASC Id: 6

#### Source ID: 1

### [ Big Redirect Detected (Potential Sensitive Information Leak) ](https://www.zaproxy.org/docs/alerts/10044/)



##### Low (Medium)

### Description

The server has responded with a redirect that seems to provide a large response. This may indicate that although the server sent a redirect it also responded with body content (which may include sensitive details, PII, etc.).

* URL: http://host.docker.internal:3100
  * Node Name: `http://host.docker.internal:3100`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `Location header URI length: 10 [/dashboard].
Predicted response size: 310.
Response Body Length: 7,023.`


Instances: 1

### Solution

Ensure that no sensitive information is leaked via redirect responses. Redirect responses should have almost no content.

### Reference



#### CWE Id: [ 201 ](https://cwe.mitre.org/data/definitions/201.html)


#### WASC Id: 13

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
* URL: http://host.docker.internal:3100/invite/
  * Node Name: `http://host.docker.internal:3100/invite/`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://host.docker.internal:3100/sign-in
  * Node Name: `http://host.docker.internal:3100/sign-in`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

### Solution

Ensure each page is setting the specific and appropriate content-type value for the content being delivered.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))


#### CWE Id: [ 345 ](https://cwe.mitre.org/data/definitions/345.html)


#### WASC Id: 12

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Ajax Spider may well be more effective than the standard one.

* URL: http://host.docker.internal:3100
  * Node Name: `http://host.docker.internal:3100`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/0paxexg6-m0de.js" async=""></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`


Instances: 1

### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ User Agent Fuzzer ](https://www.zaproxy.org/docs/alerts/10104/)



##### Informational (Medium)

### Description

Check for differences in response based on fuzzed User Agent (eg. mobile sites, access as a Search Engine Crawler). Compares the response statuscode and the hashcode of the response body with the original response.

* URL: http://host.docker.internal:3100/api/
  * Node Name: `http://host.docker.internal:3100/api/`
  * Method: `GET`
  * Parameter: `Header User-Agent`
  * Attack: `Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)`
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


