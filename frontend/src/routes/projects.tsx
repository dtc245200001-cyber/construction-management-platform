import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import api from '../lib/api'
import CategoryTreeWrapper from '../components/CategoryTreeWrapper'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/projects')({
  component: ProjectsComponent,
})

function ProjectsComponent() {
  const [projects, setProjects] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [error, setError] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  
  // Fake user role for demo since auth isn't fully integrated into this new layout
  const userRole = 'ban_quan_ly' 

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      // In a real app we'd wait for login, here we just fetch assuming cookie is there
      const res = await api.get('/projects')
      setProjects(res.data.projects || [])
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      setError(null)
      await api.post('/projects', { name, location, start_date: startDate })
      setShowForm(false)
      setName('')
      setLocation('')
      setStartDate('')
      fetchProjects()
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Quản lý dự án</h1>
      
      {userRole === 'ban_quan_ly' && (
        <Button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '20px' }}>
          {showForm ? 'Hủy' : 'Tạo dự án mới'}
        </Button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ marginBottom: '20px', padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
          {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}
          <div style={{ marginBottom: '10px' }}>
            <label>Tên dự án:</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={{ marginLeft: '10px', padding: '5px' }} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Địa điểm:</label>
            <input value={location} onChange={e => setLocation(e.target.value)} style={{ marginLeft: '10px', padding: '5px' }} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Ngày khởi công:</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ marginLeft: '10px', padding: '5px' }} />
          </div>
          <Button type="submit">Lưu dự án</Button>
        </form>
      )}

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h2>Danh sách dự án</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {projects.map(p => (
              <li 
                key={p.id} 
                onClick={() => setSelectedProjectId(p.id)}
                style={{ 
                  padding: '10px', 
                  border: '1px solid #ccc', 
                  marginBottom: '10px', 
                  cursor: 'pointer',
                  background: selectedProjectId === p.id ? '#e6f7ff' : 'white'
                }}
              >
                <strong>{p.name}</strong> - {p.location}
              </li>
            ))}
          </ul>
        </div>
        
        <div style={{ flex: 2 }}>
          {selectedProjectId ? (
            <CategoryTreeWrapper projectId={selectedProjectId} />
          ) : (
            <div style={{ padding: '20px', background: '#f9f9f9', textAlign: 'center' }}>
              Chọn một dự án để xem cây hạng mục
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
