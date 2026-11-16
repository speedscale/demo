import http from "k6/http";
import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';

export default function () {
	const ids = {};
{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/healthz');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/offers');

		url.searchParams.append('date','2026-12-18');
		url.searchParams.append('destination','LAX');
		url.searchParams.append('origin','SLC');
		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'POST';
		let body = '{\"passengers\":1}';
		let url = new URL('http://localhost:8090/api/carts');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['C000001'] = res.json('cartId');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'POST';
		let body = '{\"flightNumber\":\"DM1201\",\"fareClass\":\"Y\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000001'] + '/items');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000001'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'POST';
		let body = '{\"cardToken\":\"tok_visa_4242\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000001'] + '/checkout');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['AADQAJ'] = res.json('recordLocator');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/orders/' + ids['AADQAJ'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/offers');

		url.searchParams.append('date','2026-12-18');
		url.searchParams.append('destination','LAX');
		url.searchParams.append('origin','SLC');
		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'POST';
		let body = '{\"passengers\":2}';
		let url = new URL('http://localhost:8090/api/carts');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['C000002'] = res.json('cartId');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'POST';
		let body = '{\"flightNumber\":\"DM1205\",\"fareClass\":\"M\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000002'] + '/items');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000002'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090' },
		};
		let method = 'POST';
		let body = '{\"cardToken\":\"tok_amex_0005\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000002'] + '/checkout');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['AADXZZ'] = res.json('recordLocator');
	}{
		let params = {
			headers: { 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Host':'localhost:8090' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/orders/' + ids['AADXZZ'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/offers');

		url.searchParams.append('date','2026-12-19');
		url.searchParams.append('destination','DEN');
		url.searchParams.append('origin','SLC');
		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Content-Type':'application/json' },
		};
		let method = 'POST';
		let body = '{\"passengers\":3}';
		let url = new URL('http://localhost:8090/api/carts');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['C000003'] = res.json('cartId');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'POST';
		let body = '{\"flightNumber\":\"DM2407\",\"fareClass\":\"J\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000003'] + '/items');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000003'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Content-Type':'application/json' },
		};
		let method = 'POST';
		let body = '{\"cardToken\":\"tok_mc_4444\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000003'] + '/checkout');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['AAD7RG'] = res.json('recordLocator');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/orders/' + ids['AAD7RG'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/offers');

		url.searchParams.append('origin','LAX');
		url.searchParams.append('date','2026-12-21');
		url.searchParams.append('destination','SLC');
		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'POST';
		let body = '{\"passengers\":1}';
		let url = new URL('http://localhost:8090/api/carts');

		
		let res = http.request(method, url.toString(), body, params);
		if (res.status === 201) ids['C000004'] = res.json('cartId');
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'POST';
		let body = '{\"flightNumber\":\"DM1302\",\"fareClass\":\"Y\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000004'] + '/items');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Accept':'*/*', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000004'] + '');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Content-Type':'application/json' },
		};
		let method = 'POST';
		let body = '{\"cardToken\":\"tok_decline\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000004'] + '/checkout');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Content-Type':'application/json' },
		};
		let method = 'POST';
		let body = '{\"passengers\":12}';
		let url = new URL('http://localhost:8090/api/carts');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'User-Agent':'curl/8.7.1', 'Accept':'*/*', 'Host':'localhost:8090' },
		};
		let method = 'GET';
		let body = '';
		let url = new URL('http://localhost:8090/api/orders/ZZZZZZ');

		
		http.request(method, url.toString(), body, params);
	}{
		let params = {
			headers: { 'Content-Type':'application/json', 'Host':'localhost:8090', 'User-Agent':'curl/8.7.1', 'Accept':'*/*' },
		};
		let method = 'POST';
		let body = '{\"cardToken\":\"tok_visa_4242\"}';
		let url = new URL('http://localhost:8090/api/carts/' + ids['C000001'] + '/checkout');

		
		http.request(method, url.toString(), body, params);
	}
}