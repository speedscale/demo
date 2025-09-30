from flask import Flask, request, Response
import xml.etree.ElementTree as ET
from datetime import datetime

app = Flask(__name__)

@app.route('/query', methods=['POST'])
def handle_query():
    try:
        xml_data = request.get_data(as_text=True)
        root = ET.fromstring(xml_data)

        query_id = root.find('id').text if root.find('id') is not None else ''
        query_type = root.find('type').text if root.find('type') is not None else ''
        query_filter = root.find('filter').text if root.find('filter') is not None else ''

        response_root = ET.Element('response')

        status = ET.SubElement(response_root, 'status')
        status.text = 'success'

        timestamp = ET.SubElement(response_root, 'timestamp')
        timestamp.text = datetime.now().isoformat()

        request_info = ET.SubElement(response_root, 'request_info')
        req_id = ET.SubElement(request_info, 'id')
        req_id.text = query_id
        req_type = ET.SubElement(request_info, 'type')
        req_type.text = query_type
        req_filter = ET.SubElement(request_info, 'filter')
        req_filter.text = query_filter

        data = ET.SubElement(response_root, 'data')

        item1 = ET.SubElement(data, 'item', id='1')
        name1 = ET.SubElement(item1, 'name')
        name1.text = 'Sample Data 1'
        value1 = ET.SubElement(item1, 'value')
        value1.text = f'Value for {query_type}'

        item2 = ET.SubElement(data, 'item', id='2')
        name2 = ET.SubElement(item2, 'name')
        name2.text = 'Sample Data 2'
        value2 = ET.SubElement(item2, 'value')
        value2.text = f'Filtered by {query_filter}'

        item3 = ET.SubElement(data, 'item', id='3')
        name3 = ET.SubElement(item3, 'name')
        name3.text = 'Query ID'
        value3 = ET.SubElement(item3, 'value')
        value3.text = query_id

        response_xml = ET.tostring(response_root, encoding='unicode', xml_declaration=True)

        return Response(response_xml, mimetype='application/xml')

    except ET.ParseError:
        return Response('<error>Invalid XML</error>', status=400, mimetype='application/xml')
    except Exception as e:
        return Response(f'<error>Server error: {str(e)}</error>', status=500, mimetype='application/xml')

if __name__ == '__main__':
    print("Server starting on http://localhost:8080")
    print("Send POST requests to http://localhost:8080/query")
    app.run(debug=True, host='0.0.0.0', port=8080)